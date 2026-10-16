package com.mcnexus.bridge.fabric;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import net.fabricmc.api.DedicatedServerModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.util.Timer;
import java.util.TimerTask;
import java.util.logging.Logger;

/**
 * Hosty bridge for Fabric (server side). Speaks Hosty bridge protocol v1 (docs/bridge-protocol.md).
 * Actions are executed through vanilla commands so one build works across 1.20.x - 1.21.x.
 */
public class NexusBridgeMod implements DedicatedServerModInitializer {
    private static final Logger LOGGER = Logger.getLogger("Hosty-Bridge");
    private static final Gson GSON = new Gson();
    private static final int PROTOCOL_VERSION = 1;
    private static final String[] CAPABILITIES = {
        "telemetry.server", "telemetry.players", "inventory.view",
        "action.heal", "action.damage", "action.kill", "action.kick", "action.teleport",
        "action.freeze", "action.unfreeze", "action.smite", "action.give_exp"
    };

    private volatile WebSocketClient wsClient;
    private volatile MinecraftServer server;
    private volatile boolean authenticated = false;
    private volatile boolean shuttingDown = false;
    private long reconnectDelayMs = 5_000L;
    private final Timer reconnectTimer = new Timer("hosty-bridge-reconnect", true);

    private String instanceId = "default";
    private String daemonUrl = "ws://127.0.0.1:4000/telemetry/bridge";
    private String token = "";
    private static final long TELEMETRY_INTERVAL_MS = 1_000L;
    private final Timer telemetryTimer = new Timer("hosty-bridge-telemetry", true);

    @Override
    public void onInitializeServer() {
        connectToDaemon();
        // No Fabric API dependency: the server comes from Fabric Loader and telemetry runs on our own timer,
        // hopping onto the server thread to read game state.
        telemetryTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                requestTelemetry();
            }
        }, TELEMETRY_INTERVAL_MS, TELEMETRY_INTERVAL_MS);
        LOGGER.info("[Hosty Bridge] Fabric server module initialized.");
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
        reconnectTimer.schedule(new TimerTask() {
            @Override
            public void run() {
                connectToDaemon();
            }
        }, reconnectDelayMs);
    }

    private void connectToDaemon() {
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
        implementation.addProperty("name", "hosty-bridge-fabric");
        implementation.addProperty("version", "1.2.0");
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
                    current.execute(() -> executeAction(current, obj));
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

    private void run(MinecraftServer current, String command) {
        current.getCommandManager().executeWithPrefix(current.getCommandSource(), command);
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

        ServerPlayerEntity player = name == null ? null : current.getPlayerManager().getPlayer(name);
        if (player == null) {
            sendResult(actionId, false, "Player is not online");
            return;
        }
        String who = player.getName().getString();

        switch (action) {
            case "inventory_view":
                sendInventory(player);
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

    private JsonElement slot(ItemStack stack, int index) {
        if (stack == null || stack.isEmpty()) return JsonNull.INSTANCE;
        JsonObject o = new JsonObject();
        o.addProperty("index", index);
        o.addProperty("itemId", Registries.ITEM.getId(stack.getItem()).toString());
        o.addProperty("count", stack.getCount());
        JsonObject meta = new JsonObject();
        if (stack.isDamageable()) {
            meta.addProperty("damage", stack.getDamage());
            meta.addProperty("maxDamage", stack.getMaxDamage());
        }
        if (stack.hasCustomName()) {
            meta.addProperty("customName", stack.getName().getString());
        }
        o.add("meta", meta);
        return o;
    }

    private static JsonObject container(String id, JsonArray slots) {
        JsonObject c = new JsonObject();
        c.addProperty("id", id);
        c.add("slots", slots);
        return c;
    }

    private void sendInventory(ServerPlayerEntity player) {
        WebSocketClient client = wsClient;
        if (client == null || !client.isOpen()) return;

        JsonObject root = new JsonObject();
        root.addProperty("type", "INVENTORY");
        JsonObject who = new JsonObject();
        who.addProperty("id", player.getUuidAsString());
        who.addProperty("name", player.getName().getString());
        root.add("player", who);

        JsonArray containers = new JsonArray();

        JsonArray armor = new JsonArray();
        // getArmorStack: 0 = boots ... 3 = helmet; the protocol lists helmet first.
        for (int i = 3; i >= 0; i--) {
            armor.add(slot(player.getInventory().getArmorStack(i), 36 + i));
        }
        containers.add(container("armor", armor));

        JsonArray offhand = new JsonArray();
        offhand.add(slot(player.getOffHandStack(), 40));
        containers.add(container("offhand", offhand));

        JsonArray hotbar = new JsonArray();
        for (int i = 0; i < 9; i++) hotbar.add(slot(player.getInventory().getStack(i), i));
        containers.add(container("hotbar", hotbar));

        JsonArray main = new JsonArray();
        for (int i = 9; i < 36; i++) main.add(slot(player.getInventory().getStack(i), i));
        containers.add(container("main", main));

        root.add("containers", containers);
        client.send(GSON.toJson(root));
    }

    private void requestTelemetry() {
        Object instance = FabricLoader.getInstance().getGameInstance();
        if (!(instance instanceof MinecraftServer)) return;
        MinecraftServer current = (MinecraftServer) instance;
        this.server = current;
        WebSocketClient probe = wsClient;
        if (!authenticated || probe == null || !probe.isOpen()) return;
        current.execute(() -> sendTelemetry(current));
    }

    private void sendTelemetry(MinecraftServer current) {
        WebSocketClient client = wsClient;
        if (!authenticated || client == null || !client.isOpen()) return;

        try {
            JsonObject frame = new JsonObject();
            frame.addProperty("type", "TELEMETRY");

            double mspt = Math.round(current.getAverageTickTime() * 10.0) / 10.0;
            int chunks = 0;
            for (ServerWorld world : current.getWorlds()) {
                chunks += world.getChunkManager().getLoadedChunkCount();
            }

            JsonObject serverObj = new JsonObject();
            serverObj.addProperty("tps", Math.min(20.0, mspt > 0 ? Math.round(1000.0 / mspt * 100.0) / 100.0 : 20.0));
            serverObj.addProperty("mspt", mspt);
            serverObj.addProperty("loadedChunks", chunks);
            frame.add("server", serverObj);

            JsonArray players = new JsonArray();
            for (ServerPlayerEntity p : current.getPlayerManager().getPlayerList()) {
                JsonObject po = new JsonObject();
                po.addProperty("id", p.getUuidAsString());
                po.addProperty("name", p.getName().getString());
                po.addProperty("ping", p.networkHandler != null ? p.networkHandler.getLatency() : 0);
                po.addProperty("health", Math.round(p.getHealth() * 10.0) / 10.0);
                po.addProperty("maxHealth", (double) p.getMaxHealth());

                JsonObject position = new JsonObject();
                position.addProperty("x", Math.round(p.getX() * 10.0) / 10.0);
                position.addProperty("y", Math.round(p.getY() * 10.0) / 10.0);
                position.addProperty("z", Math.round(p.getZ() * 10.0) / 10.0);
                position.addProperty("world", p.getWorld().getRegistryKey().getValue().toString());
                po.add("position", position);

                JsonObject stats = new JsonObject();
                stats.addProperty("food", p.getHungerManager().getFoodLevel());
                stats.addProperty("gamemode", p.interactionManager.getGameMode().getName());
                stats.addProperty("isOp", current.getPlayerManager().isOperator(p.getGameProfile()));
                po.add("stats", stats);

                players.add(po);
            }
            frame.add("players", players);

            client.send(GSON.toJson(frame));
        } catch (Exception ignored) {
            // Telemetry must never disturb the server tick
        }
    }
}
