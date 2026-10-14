package com.mcnexus.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.attribute.Attribute;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.Damageable;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.io.File;
import java.net.URI;
import java.nio.file.Files;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.logging.Level;

public class NexusBridgePlugin extends JavaPlugin implements Listener {
    private static final Gson GSON = new Gson();
    private WebSocketClient wsClient;
    private BukkitTask telemetryTask;
    private String instanceId;
    private String daemonWsUri = "ws://127.0.0.1:4000/telemetry/bridge";

    private final Set<UUID> frozenPlayers = Collections.synchronizedSet(new HashSet<>());
    private final Set<UUID> mutedPlayers = Collections.synchronizedSet(new HashSet<>());

    @Override
    public void onEnable() {
        resolveInstanceId();
        getServer().getPluginManager().registerEvents(this, this);
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

        String envUri = System.getenv("MC_NEXUS_WS_URL");
        if (envUri != null && !envUri.isEmpty()) {
            this.daemonWsUri = envUri;
        }
    }

    private void connectToDaemon() {
        try {
            URI uri = new URI(daemonWsUri);
            wsClient = new WebSocketClient(uri) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    getLogger().info("[MC-Nexus Bridge] Connected to daemon at " + uri);
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

                // Namespaced canonical dimension key (e.g. "minecraft:overworld", "twilightforest:twilight_forest")
                String dimKey;
                try {
                    dimKey = p.getWorld().getKey().toString();
                } catch (Throwable t) {
                    dimKey = p.getWorld().getEnvironment().name().toLowerCase();
                }
                po.addProperty("dimension", dimKey);

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
                po.addProperty("isFrozen", frozenPlayers.contains(p.getUniqueId()));
                po.addProperty("isMuted", mutedPlayers.contains(p.getUniqueId()));

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
            case "INVENTORY_VIEW":
                sendInventoryData(player);
                break;

            case "FREEZE":
                frozenPlayers.add(player.getUniqueId());
                if (payload.has("frostEffect") && payload.get("frostEffect").getAsBoolean()) {
                    try { player.setFreezeTicks(1000); } catch (Throwable ignored) {}
                }
                break;

            case "UNFREEZE":
                frozenPlayers.remove(player.getUniqueId());
                try { player.setFreezeTicks(0); } catch (Throwable ignored) {}
                break;

            case "SMITE":
                player.getWorld().strikeLightning(player.getLocation());
                break;

            case "GIVE_EXP":
                int levels = payload.has("levels") ? payload.get("levels").getAsInt() : 5;
                player.giveExpLevels(levels);
                break;

            case "MUTE":
                mutedPlayers.add(player.getUniqueId());
                break;

            case "UNMUTE":
                mutedPlayers.remove(player.getUniqueId());
                break;

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
                if (payload.has("targetPlayer")) {
                    Player targetP = Bukkit.getPlayerExact(payload.get("targetPlayer").getAsString());
                    if (targetP != null && targetP.isOnline()) {
                        player.teleport(targetP.getLocation());
                        break;
                    }
                }
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

    private void sendInventoryData(Player player) {
        if (wsClient == null || !wsClient.isOpen()) return;

        try {
            JsonObject root = new JsonObject();
            root.addProperty("type", "INVENTORY_DATA");
            root.addProperty("instanceId", instanceId);

            JsonObject inv = new JsonObject();
            inv.addProperty("username", player.getName());
            inv.addProperty("uuid", player.getUniqueId().toString());

            // Armor (Helmet, Chestplate, Leggings, Boots)
            JsonArray armorArr = new JsonArray();
            ItemStack[] armor = player.getInventory().getArmorContents(); // [Boots, Leggings, Chestplate, Helmet] in Bukkit
            armorArr.add(serializeItem(armor.length > 3 ? armor[3] : null, 39)); // Helmet
            armorArr.add(serializeItem(armor.length > 2 ? armor[2] : null, 38)); // Chestplate
            armorArr.add(serializeItem(armor.length > 1 ? armor[1] : null, 37)); // Leggings
            armorArr.add(serializeItem(armor.length > 0 ? armor[0] : null, 36)); // Boots
            inv.add("armor", armorArr);

            // Offhand
            inv.add("offhand", serializeItem(player.getInventory().getItemInOffHand(), 40));

            // Hotbar: 0 to 8
            JsonArray hotbarArr = new JsonArray();
            for (int i = 0; i < 9; i++) {
                hotbarArr.add(serializeItem(player.getInventory().getItem(i), i));
            }
            inv.add("hotbar", hotbarArr);

            // Main Inventory: 9 to 35
            JsonArray mainArr = new JsonArray();
            for (int i = 9; i < 36; i++) {
                mainArr.add(serializeItem(player.getInventory().getItem(i), i));
            }
            inv.add("inventory", mainArr);

            root.add("inventory", inv);
            wsClient.send(GSON.toJson(root));
        } catch (Exception e) {
            getLogger().warning("[MC-Nexus Bridge] Error serializing inventory: " + e.getMessage());
        }
    }

    private JsonObject serializeItem(ItemStack item, int slot) {
        if (item == null || item.getType() == Material.AIR) {
            return null;
        }

        JsonObject io = new JsonObject();
        io.addProperty("slot", slot);
        io.addProperty("id", item.getType().getKey().toString());
        io.addProperty("count", item.getAmount());

        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            if (meta.hasDisplayName()) {
                io.addProperty("customName", meta.getDisplayName());
            }
            if (meta instanceof Damageable) {
                Damageable dmg = (Damageable) meta;
                io.addProperty("damage", dmg.getDamage());
                io.addProperty("maxDamage", (int) item.getType().getMaxDurability());
            }
            if (meta.hasEnchants()) {
                JsonArray enchArr = new JsonArray();
                for (Map.Entry<Enchantment, Integer> entry : meta.getEnchants().entrySet()) {
                    JsonObject eo = new JsonObject();
                    eo.addProperty("id", entry.getKey().getKey().getKey());
                    eo.addProperty("level", entry.getValue());
                    enchArr.add(eo);
                }
                io.add("enchantments", enchArr);
            }
        }
        return io;
    }

    @EventHandler
    public void onPlayerMove(PlayerMoveEvent event) {
        if (frozenPlayers.contains(event.getPlayer().getUniqueId())) {
            Location from = event.getFrom();
            Location to = event.getTo();
            if (to != null && (from.getX() != to.getX() || from.getY() != to.getY() || from.getZ() != to.getZ())) {
                event.setTo(new Location(from.getWorld(), from.getX(), from.getY(), from.getZ(), to.getYaw(), to.getPitch()));
            }
        }
    }

    @EventHandler
    public void onPlayerChat(AsyncPlayerChatEvent event) {
        if (mutedPlayers.contains(event.getPlayer().getUniqueId())) {
            event.setCancelled(true);
            event.getPlayer().sendMessage("§c[MC-Nexus] You are currently muted by administrator.");
        }
    }
}
