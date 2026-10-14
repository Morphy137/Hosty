package com.mcnexus.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.attribute.Attribute;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.util.logging.Level;

public class NexusBridgePlugin extends JavaPlugin {
    private static final Gson GSON = new Gson();
    private WebSocketClient wsClient;
    private BukkitTask telemetryTask;
    private String instanceId;
    private String daemonWsUri = "ws://127.0.0.1:4000/telemetry/bridge";

    @Override
    public void onEnable() {
        resolveInstanceId();
        connectToDaemon();

        // 20 ticks = 1 second
        telemetryTask = Bukkit.getScheduler().runTaskTimer(this, this::sendTickTelemetry, 20L, 20L);
        getLogger().info("[MC-Nexus Bridge] Plugin initialized for instance: " + instanceId);
    }

    @Override
    public void onDisable() {
        if (telemetryTask != null) {
            telemetryTask.cancel();
        }
        if (wsClient != null && wsClient.isOpen()) {
            wsClient.close();
        }
        getLogger().info("[MC-Nexus Bridge] Plugin disabled.");
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
            URI uri = new URI(daemonWsUri);
            wsClient = new WebSocketClient(uri) {
                @Override
                public void onOpen(ServerHandshake handshake) {
                    getLogger().info("[MC-Nexus Bridge] Connected to daemon at " + daemonWsUri);
                    sendHello();
                }

                @Override
                public void onMessage(String message) {
                    handleIncomingMessage(message);
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    getLogger().warning("[MC-Nexus Bridge] Connection to daemon lost. Reconnecting in 5s...");
                    Bukkit.getScheduler().runTaskLater(NexusBridgePlugin.this, NexusBridgePlugin.this::connectToDaemon, 100L);
                }

                @Override
                public void onError(Exception ex) {
                    getLogger().log(Level.FINE, "[MC-Nexus Bridge] WS Error: " + ex.getMessage());
                }
            };
            wsClient.connect();
        } catch (Exception e) {
            getLogger().warning("[MC-Nexus Bridge] Failed to initialize WebSocket: " + e.getMessage());
        }
    }

    private void sendHello() {
        if (wsClient == null || !wsClient.isOpen()) return;

        JsonObject hello = new JsonObject();
        hello.addProperty("type", "BRIDGE_HELLO");
        hello.addProperty("instanceId", instanceId);
        hello.addProperty("loader", "paper");
        hello.addProperty("version", Bukkit.getVersion());
        wsClient.send(GSON.toJson(hello));
    }

    private void sendTickTelemetry() {
        if (wsClient == null || !wsClient.isOpen()) return;

        try {
            JsonObject frame = new JsonObject();
            frame.addProperty("type", "TICK_TELEMETRY");
            frame.addProperty("instanceId", instanceId);

            // Server Metrics
            JsonObject server = new JsonObject();
            double[] tpsArr = Bukkit.getTPS();
            double tps = tpsArr.length > 0 ? Math.min(20.0, Math.round(tpsArr[0] * 100.0) / 100.0) : 20.0;
            server.addProperty("tps", tps);

            // MSPT (Paper / Purpur extension check)
            double mspt = 10.0;
            try {
                mspt = Bukkit.getAverageTickTime();
            } catch (Throwable ignored) {
                // Vanilla / Spigot fallback
            }
            server.addProperty("mspt", Math.round(mspt * 10.0) / 10.0);

            int chunks = 0;
            int entities = 0;
            for (org.bukkit.World w : Bukkit.getWorlds()) {
                chunks += w.getLoadedChunks().length;
                entities += w.getEntities().size();
            }
            server.addProperty("loadedChunks", chunks);
            server.addProperty("entitiesCount", entities);
            frame.add("server", server);

            // Players Array
            JsonArray players = new JsonArray();
            for (Player p : Bukkit.getOnlinePlayers()) {
                JsonObject po = new JsonObject();
                po.addProperty("uuid", p.getUniqueId().toString());
                po.addProperty("username", p.getName());
                po.addProperty("dimension", p.getWorld().getEnvironment().name().toLowerCase());

                Location loc = p.getLocation();
                po.addProperty("x", Math.round(loc.getX() * 10.0) / 10.0);
                po.addProperty("y", Math.round(loc.getY() * 10.0) / 10.0);
                po.addProperty("z", Math.round(loc.getZ() * 10.0) / 10.0);

                po.addProperty("health", Math.round(p.getHealth() * 10.0) / 10.0);
                double maxHealth = 20.0;
                try {
                    if (p.getAttribute(Attribute.GENERIC_MAX_HEALTH) != null) {
                        maxHealth = p.getAttribute(Attribute.GENERIC_MAX_HEALTH).getValue();
                    }
                } catch (Throwable ignored) {}
                po.addProperty("maxHealth", maxHealth);

                po.addProperty("food", p.getFoodLevel());
                po.addProperty("ping", p.getPing());
                po.addProperty("gamemode", p.getGameMode().name().toLowerCase());
                po.addProperty("isOp", p.isOp());

                players.add(po);
            }
            frame.add("players", players);

            wsClient.send(GSON.toJson(frame));
        } catch (Exception e) {
            getLogger().log(Level.WARNING, "[MC-Nexus Bridge] Telemetry error: " + e.getMessage());
        }
    }

    private void handleIncomingMessage(String raw) {
        try {
            JsonObject obj = GSON.fromJson(raw, JsonObject.class);
            if (!obj.has("type")) return;

            String type = obj.get("type").getAsString();
            if ("ACTION".equals(type)) {
                String action = obj.get("action").getAsString();
                String username = obj.get("username").getAsString();

                // Run on main Bukkit server thread
                Bukkit.getScheduler().runTask(this, () -> executeAction(action, username, obj));
            }
        } catch (Exception e) {
            getLogger().warning("[MC-Nexus Bridge] Failed to handle daemon action: " + e.getMessage());
        }
    }

    private void executeAction(String action, String username, JsonObject payload) {
        Player player = Bukkit.getPlayerExact(username);
        if (player == null || !player.isOnline()) return;

        switch (action) {
            case "HEAL":
                double healAmount = payload.has("amount") ? payload.get("amount").getAsDouble() : 20.0;
                double maxHp = 20.0;
                try {
                    if (player.getAttribute(Attribute.GENERIC_MAX_HEALTH) != null) {
                        maxHp = player.getAttribute(Attribute.GENERIC_MAX_HEALTH).getValue();
                    }
                } catch (Throwable ignored) {}
                player.setHealth(Math.min(maxHp, player.getHealth() + healAmount));

                if (payload.has("feed") && payload.get("feed").getAsBoolean()) {
                    player.setFoodLevel(20);
                    player.setSaturation(20.0f);
                }
                break;

            case "DAMAGE":
                double dmg = payload.has("amount") ? payload.get("amount").getAsDouble() : 4.0;
                player.damage(dmg);
                break;

            case "KILL":
                player.setHealth(0.0);
                break;

            case "KICK":
                String reason = payload.has("reason") ? payload.get("reason").getAsString() : "Kicked by administrator";
                player.kickPlayer(reason);
                break;

            case "TELEPORT":
                if (payload.has("x") && payload.has("y") && payload.has("z")) {
                    double x = payload.get("x").getAsDouble();
                    double y = payload.get("y").getAsDouble();
                    double z = payload.get("z").getAsDouble();
                    Location target = new Location(player.getWorld(), x, y, z, player.getLocation().getYaw(), player.getLocation().getPitch());
                    player.teleport(target);
                }
                break;
        }
    }
}
