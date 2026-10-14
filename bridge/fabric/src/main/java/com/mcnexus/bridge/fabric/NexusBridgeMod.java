package com.mcnexus.bridge.fabric;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.fabricmc.api.DedicatedServerModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.util.logging.Logger;

public class NexusBridgeMod implements DedicatedServerModInitializer {
    private static final Logger LOGGER = Logger.getLogger("MC-Nexus-Bridge");
    private static final Gson GSON = new Gson();
    private WebSocketClient wsClient;
    private String instanceId = "default";
    private int tickCounter = 0;

    @Override
    public void onInitializeServer() {
        resolveInstanceId();
        connectToDaemon();

        ServerTickEvents.END_SERVER_TICK.register(this::onServerTick);
        LOGGER.info("[MC-Nexus Bridge] Fabric server module initialized for " + instanceId);
    }

    private void resolveInstanceId() {
        try {
            File currentDir = new File(".").getCanonicalFile();
            File idFile = new File(currentDir, ".nexus-instance-id");
            if (idFile.exists()) {
                this.instanceId = Files.readString(idFile.toPath()).trim();
            } else {
                this.instanceId = currentDir.getName();
            }
        } catch (Exception e) {
            this.instanceId = "default";
        }
    }

    private void connectToDaemon() {
        try {
            URI uri = new URI("ws://127.0.0.1:4000/telemetry/bridge");
            wsClient = new WebSocketClient(uri) {
                @Override
                public void onOpen(ServerHandshake handshake) {
                    LOGGER.info("[MC-Nexus Bridge] Connected to daemon.");
                    JsonObject hello = new JsonObject();
                    hello.addProperty("type", "BRIDGE_HELLO");
                    hello.addProperty("instanceId", instanceId);
                    hello.addProperty("loader", "fabric");
                    send(GSON.toJson(hello));
                }

                @Override
                public void onMessage(String message) {}

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    LOGGER.warning("[MC-Nexus Bridge] Connection lost.");
                }

                @Override
                public void onError(Exception ex) {}
            };
            wsClient.connect();
        } catch (Exception e) {
            LOGGER.warning("[MC-Nexus Bridge] Error connecting: " + e.getMessage());
        }
    }

    private void onServerTick(MinecraftServer server) {
        tickCounter++;
        if (tickCounter < 20) return; // 1 second
        tickCounter = 0;

        if (wsClient == null || !wsClient.isOpen()) return;

        try {
            JsonObject frame = new JsonObject();
            frame.addProperty("type", "TICK_TELEMETRY");
            frame.addProperty("instanceId", instanceId);

            JsonObject serverObj = new JsonObject();
            serverObj.addProperty("tps", 20.0);
            serverObj.addProperty("mspt", Math.round(server.getAverageTickTime() * 10.0) / 10.0);
            serverObj.addProperty("loadedChunks", 0);
            serverObj.addProperty("entitiesCount", 0);
            frame.add("server", serverObj);

            JsonArray players = new JsonArray();
            for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
                JsonObject po = new JsonObject();
                po.addProperty("uuid", p.getUuidAsString());
                po.addProperty("username", p.getName().getString());
                po.addProperty("dimension", p.getWorld().getRegistryKey().getValue().toString());
                po.addProperty("x", Math.round(p.getX() * 10.0) / 10.0);
                po.addProperty("y", Math.round(p.getY() * 10.0) / 10.0);
                po.addProperty("z", Math.round(p.getZ() * 10.0) / 10.0);
                po.addProperty("health", Math.round(p.getHealth() * 10.0) / 10.0);
                po.addProperty("maxHealth", (double) p.getMaxHealth());
                po.addProperty("food", p.getHungerManager().getFoodLevel());
                po.addProperty("ping", p.pingMilliseconds);
                po.addProperty("gamemode", p.interactionManager.getGameMode().getName());
                po.addProperty("isOp", server.getPlayerManager().isOperator(p.getGameProfile()));
                players.add(po);
            }
            frame.add("players", players);

            wsClient.send(GSON.toJson(frame));
        } catch (Exception ignored) {}
    }
}
