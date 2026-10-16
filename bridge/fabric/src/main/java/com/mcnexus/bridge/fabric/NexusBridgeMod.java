package com.mcnexus.bridge.fabric;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.fabricmc.api.DedicatedServerModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.server.MinecraftServer;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.util.Timer;
import java.util.TimerTask;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Hosty bridge for Fabric (server side). Speaks Hosty bridge protocol v1 (docs/bridge-protocol.md).
 * Game access goes through {@link GameAccess} so one build works on 1.20.x - 1.21.x and on unobfuscated 26.x;
 * actions are vanilla commands. Nothing the bridge does may stop the server: any failure is contained, and an
 * incompatible game version switches the bridge off so Hosty falls back to reading the server log.
 */
public class NexusBridgeMod implements DedicatedServerModInitializer {
    private static final Logger LOGGER = Logger.getLogger("Hosty-Bridge");
    private static final Gson GSON = new Gson();
    private static final int PROTOCOL_VERSION = 1;
    private static final String IMPLEMENTATION_NAME = "hosty-bridge-fabric";
    private static final String IMPLEMENTATION_VERSION = "1.3.0";
    private static final String[] CAPABILITIES = {
        "telemetry.server", "telemetry.players", "inventory.view",
        "action.heal", "action.damage", "action.kill", "action.kick", "action.teleport",
        "action.freeze", "action.unfreeze", "action.smite", "action.give_exp"
    };
    /** WebSocket close code for "policy violation": tells Hosty the bridge stopped on purpose. */
    private static final int CLOSE_UNSUPPORTED = 1008;

    private volatile WebSocketClient wsClient;
    private volatile MinecraftServer server;
    private volatile boolean authenticated = false;
    private volatile boolean shuttingDown = false;
    private volatile GameAccess access;
    private long reconnectDelayMs = 5_000L;
    private final Timer reconnectTimer = new Timer("hosty-bridge-reconnect", true);

    private String instanceId = "default";
    private String daemonUrl = "ws://127.0.0.1:4000/telemetry/bridge";
    private String token = "";
    private static final long DEFAULT_TELEMETRY_INTERVAL_MS = 1_000L;
    private static final long MIN_TELEMETRY_INTERVAL_MS = 250L;
    private static final long MAX_TELEMETRY_INTERVAL_MS = 10_000L;
    private final Timer telemetryTimer = new Timer("hosty-bridge-telemetry", true);

    @Override
    public void onInitializeServer() {
        try {
            access = GameAccess.detect();
        } catch (LinkageError e) {
            LOGGER.log(Level.WARNING, "[Hosty Bridge] This Minecraft version is not supported; the bridge stays off.", e);
            return;
        }
        connectToDaemon();
        // No Fabric API dependency: the server comes from Fabric Loader and telemetry runs on our own timer,
        // hopping onto the server thread to read game state.
        long interval = readTelemetryInterval();
        telemetryTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                guarded("telemetry", () -> requestTelemetry());
            }
        }, interval, interval);
        LOGGER.info("[Hosty Bridge] Fabric server module initialized (" + access.name() + " names).");
    }

    /** Reads `config/mc-nexus-bridge.json` (`telemetryIntervalMs`); falls back to one second. */
    private long readTelemetryInterval() {
        try {
            File file = new File(new File(new File(".").getCanonicalFile(), "config"), "mc-nexus-bridge.json");
            if (!file.exists()) return DEFAULT_TELEMETRY_INTERVAL_MS;
            JsonObject config = GSON.fromJson(Files.readString(file.toPath()), JsonObject.class);
            if (config == null || !config.has("telemetryIntervalMs")) return DEFAULT_TELEMETRY_INTERVAL_MS;
            long value = config.get("telemetryIntervalMs").getAsLong();
            return Math.max(MIN_TELEMETRY_INTERVAL_MS, Math.min(MAX_TELEMETRY_INTERVAL_MS, value));
        } catch (Exception e) {
            return DEFAULT_TELEMETRY_INTERVAL_MS;
        }
    }

    /**
     * Runs bridge work so that it can never take the server down. A {@link LinkageError} means the game does not
     * have a method or class the bridge relies on (another Minecraft version): the bridge shuts itself off.
     */
    private void guarded(String what, Runnable work) {
        if (shuttingDown) return;
        try {
            work.run();
        } catch (LinkageError e) {
            disable(what, e);
        } catch (Throwable t) {
            LOGGER.log(Level.WARNING, "[Hosty Bridge] " + what + " failed: " + t, t);
        }
    }

    private void disable(String what, Throwable cause) {
        if (shuttingDown) return;
        shuttingDown = true;
        authenticated = false;
        telemetryTimer.cancel();
        reconnectTimer.cancel();
        LOGGER.log(Level.SEVERE, "[Hosty Bridge] This Minecraft version is not supported by the bridge (" + what
            + "). The bridge is now off; Hosty keeps working from the server log. Please update the bridge.", cause);
        WebSocketClient client = wsClient;
        if (client != null && client.isOpen()) client.close(CLOSE_UNSUPPORTED, "UNSUPPORTED_GAME_VERSION");
    }

    private boolean loadConnectionConfig() {
        try {
            File serverDir = new File(".").getCanonicalFile();
            instanceId = serverDir.getName();

            File configFile = new File(new File(serverDir, ".hosty"), "bridge.json");
            if (!configFile.exists()) {
                LOGGER.warning("[Hosty Bridge] .hosty/bridge.json not found. Start the server from Hosty so it can be generated.");
                return false;
            }
            JsonObject config = GSON.fromJson(Files.readString(configFile.toPath()), JsonObject.class);
            if (config.has("url")) daemonUrl = config.get("url").getAsString();
            if (config.has("instanceId")) instanceId = config.get("instanceId").getAsString();
            token = config.has("token") ? config.get("token").getAsString() : "";
            return !token.isEmpty();
        } catch (Exception e) {
            LOGGER.warning("[Hosty Bridge] Could not read bridge configuration: " + e.getMessage());
            return false;
        }
    }

    private void scheduleReconnect() {
        if (shuttingDown) return;
        try {
            reconnectTimer.schedule(new TimerTask() {
                @Override
                public void run() {
                    connectToDaemon();
                }
            }, reconnectDelayMs);
        } catch (IllegalStateException cancelled) {
            // The bridge was switched off meanwhile.
        }
    }

    private void connectToDaemon() {
        if (shuttingDown) return;
        if (!loadConnectionConfig()) {
            scheduleReconnect();
            return;
        }

        try {
            wsClient = new WebSocketClient(new URI(daemonUrl)) {
                @Override
                public void onOpen(ServerHandshake handshake) {
                    sendHello();
                }

                @Override
                public void onMessage(String message) {
                    handleIncoming(message);
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    authenticated = false;
                    scheduleReconnect();
                }

                @Override
                public void onError(Exception ex) {
                    // Reconnect is handled in onClose
                }
            };
            // Non-daemon socket threads would keep the JVM alive after `stop`, so Hosty had to kill the server.
            wsClient.setDaemon(true);
            wsClient.connect();
        } catch (Exception e) {
            LOGGER.warning("[Hosty Bridge] Error connecting: " + e.getMessage());
            scheduleReconnect();
        }
    }

    private void sendHello() {
        JsonObject hello = new JsonObject();
        hello.addProperty("type", "HELLO");
        hello.addProperty("protocolVersion", PROTOCOL_VERSION);
        hello.addProperty("instanceId", instanceId);
        hello.addProperty("token", token);
        hello.addProperty("game", "minecraft");

        JsonObject implementation = new JsonObject();
        implementation.addProperty("name", IMPLEMENTATION_NAME);
        implementation.addProperty("version", IMPLEMENTATION_VERSION);
        hello.add("implementation", implementation);

        JsonArray caps = new JsonArray();
        for (String capability : CAPABILITIES) caps.add(capability);
        hello.add("capabilities", caps);

        wsClient.send(GSON.toJson(hello));
    }

    private void handleIncoming(String raw) {
        try {
            JsonObject obj = GSON.fromJson(raw, JsonObject.class);
            if (obj == null || !obj.has("type")) return;
            String type = obj.get("type").getAsString();

            if ("HELLO_ACK".equals(type)) {
                authenticated = obj.has("ok") && obj.get("ok").getAsBoolean();
                reconnectDelayMs = authenticated ? 5_000L : 60_000L;
                if (authenticated) {
                    LOGGER.info("[Hosty Bridge] Connected to Hosty (protocol v" + PROTOCOL_VERSION + ").");
                } else {
                    LOGGER.warning("[Hosty Bridge] Hosty refused the connection: " + raw);
                }
                return;
            }

            if (authenticated && "ACTION".equals(type)) {
                MinecraftServer current = server;
                if (current != null) {
                    current.execute(() -> guarded("action", () -> executeAction(current, obj)));
                }
            }
        } catch (Exception e) {
            LOGGER.warning("[Hosty Bridge] Failed to handle daemon message: " + e.getMessage());
        }
    }

    private void sendResult(String actionId, boolean success, String message) {
        WebSocketClient client = wsClient;
        if (client == null || !client.isOpen()) return;
        JsonObject result = new JsonObject();
        result.addProperty("type", "RESULT");
        if (actionId != null) result.addProperty("actionId", actionId);
        result.addProperty("success", success);
        if (message != null) result.addProperty("message", message);
        client.send(GSON.toJson(result));
    }

    private static String sanitize(String value) {
        // Player names are [A-Za-z0-9_]; reasons are free text but must not break the command line.
        return value.replaceAll("[\\r\\n]+", " ");
    }

    private void executeAction(MinecraftServer current, JsonObject message) {
        String actionId = message.has("actionId") && !message.get("actionId").isJsonNull()
            ? message.get("actionId").getAsString() : null;
        String action = message.has("action") ? message.get("action").getAsString() : "";
        JsonObject params = message.has("params") && message.get("params").isJsonObject()
            ? message.getAsJsonObject("params") : new JsonObject();

        String name = null;
        if (message.has("target") && message.get("target").isJsonObject()) {
            JsonObject target = message.getAsJsonObject("target");
            if (target.has("name")) name = target.get("name").getAsString();
        }

        String who = name == null ? null : access.onlinePlayerName(current, name);
        if (who == null) {
            sendResult(actionId, false, "Player is not online");
            return;
        }

        switch (action) {
            case "inventory_view":
                sendInventory(current, who);
                break;
            case "heal": {
                int amplifier = (int) Math.max(0, Math.min(255, params.has("amount") ? params.get("amount").getAsInt() : 20));
                run(current, "effect give " + who + " minecraft:instant_health 1 " + amplifier + " true");
                if (params.has("feed") && params.get("feed").getAsBoolean()) {
                    run(current, "effect give " + who + " minecraft:saturation 1 20 true");
                }
                break;
            }
            case "damage": {
                double amount = params.has("amount") ? params.get("amount").getAsDouble() : 4.0;
                run(current, "damage " + who + " " + amount);
                break;
            }
            case "kill":
                run(current, "kill " + who);
                break;
            case "kick": {
                String reason = params.has("reason") ? params.get("reason").getAsString() : "Kicked by administrator";
                run(current, "kick " + who + " " + sanitize(reason));
                break;
            }
            case "teleport": {
                if (params.has("targetPlayer")) {
                    run(current, "tp " + who + " " + sanitize(params.get("targetPlayer").getAsString()));
                } else if (params.has("x") && params.has("y") && params.has("z")) {
                    run(current, "tp " + who + " " + params.get("x").getAsDouble() + " "
                        + params.get("y").getAsDouble() + " " + params.get("z").getAsDouble());
                }
                break;
            }
            case "freeze":
                run(current, "effect give " + who + " minecraft:slowness infinite 255 true");
                run(current, "effect give " + who + " minecraft:jump_boost infinite 250 true");
                break;
            case "unfreeze":
                run(current, "effect clear " + who + " minecraft:slowness");
                run(current, "effect clear " + who + " minecraft:jump_boost");
                break;
            case "smite":
                run(current, "execute at " + who + " run summon minecraft:lightning_bolt ~ ~ ~");
                break;
            case "give_exp": {
                int levels = params.has("levels") ? params.get("levels").getAsInt() : 5;
                run(current, "experience add " + who + " " + levels + " levels");
                break;
            }
            default:
                sendResult(actionId, false, "Unsupported action: " + action);
                return;
        }
        sendResult(actionId, true, null);
    }

    private void run(MinecraftServer current, String command) {
        access.runCommand(current, command);
    }

    private void sendInventory(MinecraftServer current, String playerName) {
        WebSocketClient client = wsClient;
        if (client == null || !client.isOpen()) return;
        JsonObject inventory = access.inventory(current, playerName);
        if (inventory == null) return;
        JsonObject frame = new JsonObject();
        frame.addProperty("type", "INVENTORY");
        for (String key : inventory.keySet()) frame.add(key, inventory.get(key));
        client.send(GSON.toJson(frame));
    }

    private void requestTelemetry() {
        Object instance = FabricLoader.getInstance().getGameInstance();
        if (!(instance instanceof MinecraftServer)) return;
        MinecraftServer current = (MinecraftServer) instance;
        this.server = current;
        WebSocketClient probe = wsClient;
        if (!authenticated || probe == null || !probe.isOpen()) return;
        current.execute(() -> guarded("telemetry", () -> sendTelemetry(current)));
    }

    private void sendTelemetry(MinecraftServer current) {
        WebSocketClient client = wsClient;
        if (!authenticated || client == null || !client.isOpen()) return;

        JsonObject frame = new JsonObject();
        frame.addProperty("type", "TELEMETRY");
        frame.add("server", access.serverTelemetry(current));
        frame.add("players", access.playersTelemetry(current));
        client.send(GSON.toJson(frame));
    }
}
