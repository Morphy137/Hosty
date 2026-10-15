package com.mcnexus.bridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
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

/**
 * Hosty bridge for Paper / Purpur / Spigot. Speaks Hosty bridge protocol v1 (docs/bridge-protocol.md):
 * the daemon URL and the per-instance token come from {@code .hosty/bridge.json} in the server folder.
 */
public class NexusBridgePlugin extends JavaPlugin implements Listener {
    private static final Gson GSON = new Gson();
    private static final int PROTOCOL_VERSION = 1;
    private static final String[] CAPABILITIES = {
        "telemetry.server", "telemetry.players", "inventory.view",
        "action.heal", "action.damage", "action.kill", "action.kick", "action.teleport",
        "action.freeze", "action.unfreeze", "action.smite", "action.give_exp", "action.mute", "action.unmute"
    };

    private WebSocketClient wsClient;
    private BukkitTask telemetryTask;
    private volatile boolean authenticated = false;
    private volatile boolean shuttingDown = false;
    private long reconnectDelayTicks = 100L;

    private String instanceId;
    private String daemonWsUri = "ws://127.0.0.1:4000/telemetry/bridge";
    private String token = "";

    private final Set<UUID> frozenPlayers = Collections.synchronizedSet(new HashSet<>());
    private final Set<UUID> mutedPlayers = Collections.synchronizedSet(new HashSet<>());

    @Override
    public void onEnable() {
        getServer().getPluginManager().registerEvents(this, this);
        connectToDaemon();

        // 20 ticks = 1 second
        telemetryTask = Bukkit.getScheduler().runTaskTimer(this, this::sendTelemetry, 20L, 20L);
        getLogger().info("[Hosty Bridge] Plugin initialized.");
    }

    @Override
    public void onDisable() {
        shuttingDown = true;
        if (telemetryTask != null) {
            telemetryTask.cancel();
        }
        if (wsClient != null && wsClient.isOpen()) {
            wsClient.close();
        }
        getLogger().info("[Hosty Bridge] Plugin disabled.");
    }

    /** Reads daemon URL, instance id and token written by the daemon before the server started. */
    private boolean loadConnectionConfig() {
        try {
            File serverDir = new File(".").getCanonicalFile();
            this.instanceId = serverDir.getName();

            File legacyId = new File(serverDir, ".nexus-instance-id");
            if (legacyId.exists()) {
                this.instanceId = Files.readString(legacyId.toPath()).trim();
            }

            File configFile = new File(new File(serverDir, ".hosty"), "bridge.json");
            if (!configFile.exists()) {
                getLogger().warning("[Hosty Bridge] .hosty/bridge.json not found. Start the server from Hosty so it can be generated.");
                return false;
            }

            JsonObject config = GSON.fromJson(Files.readString(configFile.toPath()), JsonObject.class);
            if (config.has("url")) this.daemonWsUri = config.get("url").getAsString();
            if (config.has("instanceId")) this.instanceId = config.get("instanceId").getAsString();
            this.token = config.has("token") ? config.get("token").getAsString() : "";
            return !token.isEmpty();
        } catch (Exception e) {
            getLogger().warning("[Hosty Bridge] Could not read bridge configuration: " + e.getMessage());
            return false;
        }
    }

    private void connectToDaemon() {
        if (shuttingDown) return;

        if (!loadConnectionConfig()) {
            scheduleReconnect();
            return;
        }

        try {
            URI uri = new URI(daemonWsUri);
            wsClient = new WebSocketClient(uri) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    sendHello();
                }

                @Override
                public void onMessage(String message) {
                    handleIncomingMessage(message);
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    authenticated = false;
                    if (!shuttingDown) {
                        scheduleReconnect();
                    }
                }

                @Override
                public void onError(Exception ex) {
                    getLogger().log(Level.FINE, "[Hosty Bridge] WS error: " + ex.getMessage());
                }
            };
            wsClient.connect();
        } catch (Exception e) {
            getLogger().warning("[Hosty Bridge] Failed to initialize WebSocket: " + e.getMessage());
            scheduleReconnect();
        }
    }

    private void scheduleReconnect() {
        if (shuttingDown) return;
        Bukkit.getScheduler().runTaskLater(this, this::connectToDaemon, reconnectDelayTicks);
    }

    private void sendHello() {
        if (wsClient == null || !wsClient.isOpen()) return;

        JsonObject hello = new JsonObject();
        hello.addProperty("type", "HELLO");
        hello.addProperty("protocolVersion", PROTOCOL_VERSION);
        hello.addProperty("instanceId", instanceId);
        hello.addProperty("token", token);
        hello.addProperty("game", "minecraft");

        JsonObject implementation = new JsonObject();
        implementation.addProperty("name", "hosty-bridge-paper");
        implementation.addProperty("version", getDescription().getVersion());
        hello.add("implementation", implementation);

        JsonArray caps = new JsonArray();
        for (String capability : CAPABILITIES) caps.add(capability);
        hello.add("capabilities", caps);

        wsClient.send(GSON.toJson(hello));
    }

    private void sendTelemetry() {
        if (!authenticated || wsClient == null || !wsClient.isOpen()) return;

        try {
            JsonObject frame = new JsonObject();
            frame.addProperty("type", "TELEMETRY");

            JsonObject server = new JsonObject();
            double[] tpsArr = Bukkit.getTPS();
            double tps = tpsArr.length > 0 ? Math.min(20.0, Math.round(tpsArr[0] * 100.0) / 100.0) : 20.0;
            server.addProperty("tps", tps);

            double mspt = 10.0;
            try {
                mspt = Bukkit.getAverageTickTime();
            } catch (Throwable ignored) {
                // Spigot fallback
            }
            server.addProperty("mspt", Math.round(mspt * 10.0) / 10.0);

            int chunks = 0;
            int entities = 0;
            for (org.bukkit.World w : Bukkit.getWorlds()) {
                chunks += w.getLoadedChunks().length;
                entities += w.getEntities().size();
            }
            server.addProperty("loadedChunks", chunks);
            server.addProperty("entities", entities);
            frame.add("server", server);

            JsonArray players = new JsonArray();
            for (Player p : Bukkit.getOnlinePlayers()) {
                JsonObject po = new JsonObject();
                po.addProperty("id", p.getUniqueId().toString());
                po.addProperty("name", p.getName());
                po.addProperty("ping", p.getPing());
                po.addProperty("health", Math.round(p.getHealth() * 10.0) / 10.0);
                po.addProperty("maxHealth", maxHealthOf(p));

                JsonObject position = new JsonObject();
                Location loc = p.getLocation();
                position.addProperty("x", Math.round(loc.getX() * 10.0) / 10.0);
                position.addProperty("y", Math.round(loc.getY() * 10.0) / 10.0);
                position.addProperty("z", Math.round(loc.getZ() * 10.0) / 10.0);
                String dimKey;
                try {
                    dimKey = p.getWorld().getKey().toString();
                } catch (Throwable t) {
                    dimKey = p.getWorld().getEnvironment().name().toLowerCase();
                }
                position.addProperty("world", dimKey);
                po.add("position", position);

                JsonObject stats = new JsonObject();
                stats.addProperty("food", p.getFoodLevel());
                stats.addProperty("gamemode", p.getGameMode().name().toLowerCase());
                stats.addProperty("isOp", p.isOp());
                stats.addProperty("isFrozen", frozenPlayers.contains(p.getUniqueId()));
                stats.addProperty("isMuted", mutedPlayers.contains(p.getUniqueId()));
                po.add("stats", stats);

                players.add(po);
            }
            frame.add("players", players);

            wsClient.send(GSON.toJson(frame));
        } catch (Exception e) {
            getLogger().log(Level.WARNING, "[Hosty Bridge] Telemetry error: " + e.getMessage());
        }
    }

    private double maxHealthOf(Player p) {
        try {
            if (p.getAttribute(Attribute.GENERIC_MAX_HEALTH) != null) {
                return p.getAttribute(Attribute.GENERIC_MAX_HEALTH).getValue();
            }
        } catch (Throwable ignored) {
            // Attribute enum renamed on newer versions; use the vanilla default.
        }
        return 20.0;
    }

    private void handleIncomingMessage(String raw) {
        try {
            JsonObject obj = GSON.fromJson(raw, JsonObject.class);
            if (obj == null || !obj.has("type")) return;

            String type = obj.get("type").getAsString();

            if ("HELLO_ACK".equals(type)) {
                boolean ok = obj.has("ok") && obj.get("ok").getAsBoolean();
                authenticated = ok;
                if (ok) {
                    reconnectDelayTicks = 100L;
                    getLogger().info("[Hosty Bridge] Connected to Hosty (protocol v" + PROTOCOL_VERSION + ").");
                } else {
                    reconnectDelayTicks = 20L * 60;
                    String message = "rejected";
                    if (obj.has("error") && obj.get("error").isJsonObject()) {
                        JsonObject error = obj.getAsJsonObject("error");
                        message = error.has("message") ? error.get("message").getAsString() : message;
                    }
                    getLogger().warning("[Hosty Bridge] Hosty refused the connection: " + message);
                }
                return;
            }

            if (!authenticated) return;

            if ("ACTION".equals(type)) {
                final JsonObject message = obj;
                // Bukkit API must be used from the main server thread
                Bukkit.getScheduler().runTask(this, () -> executeAction(message));
            }
        } catch (Exception e) {
            getLogger().warning("[Hosty Bridge] Failed to handle daemon message: " + e.getMessage());
        }
    }

    private void sendResult(String actionId, boolean success, String message) {
        if (wsClient == null || !wsClient.isOpen()) return;
        JsonObject result = new JsonObject();
        result.addProperty("type", "RESULT");
        if (actionId != null) result.addProperty("actionId", actionId);
        result.addProperty("success", success);
        if (message != null) result.addProperty("message", message);
        wsClient.send(GSON.toJson(result));
    }

    private static JsonObject paramsOf(JsonObject message) {
        JsonElement params = message.get("params");
        return params != null && params.isJsonObject() ? params.getAsJsonObject() : new JsonObject();
    }

    private void executeAction(JsonObject message) {
        String actionId = message.has("actionId") && !message.get("actionId").isJsonNull()
            ? message.get("actionId").getAsString() : null;
        String action = message.has("action") ? message.get("action").getAsString() : "";
        JsonObject params = paramsOf(message);

        String username = null;
        if (message.has("target") && message.get("target").isJsonObject()) {
            JsonObject target = message.getAsJsonObject("target");
            if (target.has("name")) username = target.get("name").getAsString();
        }

        Player player = username == null ? null : Bukkit.getPlayerExact(username);
        if (player == null || !player.isOnline()) {
            sendResult(actionId, false, "Player is not online");
            return;
        }

        switch (action) {
            case "inventory_view":
                sendInventory(player);
                break;

            case "freeze":
                frozenPlayers.add(player.getUniqueId());
                if (params.has("frostEffect") && params.get("frostEffect").getAsBoolean()) {
                    try { player.setFreezeTicks(1000); } catch (Throwable ignored) {}
                }
                break;

            case "unfreeze":
                frozenPlayers.remove(player.getUniqueId());
                try { player.setFreezeTicks(0); } catch (Throwable ignored) {}
                break;

            case "smite":
                player.getWorld().strikeLightning(player.getLocation());
                break;

            case "give_exp": {
                int levels = params.has("levels") ? params.get("levels").getAsInt() : 5;
                player.giveExpLevels(levels);
                break;
            }

            case "mute":
                mutedPlayers.add(player.getUniqueId());
                break;

            case "unmute":
                mutedPlayers.remove(player.getUniqueId());
                break;

            case "heal": {
                double healAmount = params.has("amount") ? params.get("amount").getAsDouble() : 20.0;
                player.setHealth(Math.min(maxHealthOf(player), player.getHealth() + healAmount));
                if (params.has("feed") && params.get("feed").getAsBoolean()) {
                    player.setFoodLevel(20);
                    player.setSaturation(20.0f);
                }
                break;
            }

            case "damage": {
                double dmg = params.has("amount") ? params.get("amount").getAsDouble() : 4.0;
                player.damage(dmg);
                break;
            }

            case "kill":
                player.setHealth(0.0);
                break;

            case "kick": {
                String reason = params.has("reason") ? params.get("reason").getAsString() : "Kicked by administrator";
                player.kickPlayer(reason);
                break;
            }

            case "teleport": {
                if (params.has("targetPlayer")) {
                    Player targetP = Bukkit.getPlayerExact(params.get("targetPlayer").getAsString());
                    if (targetP != null && targetP.isOnline()) {
                        player.teleport(targetP.getLocation());
                        break;
                    }
                }
                if (params.has("x") && params.has("y") && params.has("z")) {
                    Location target = new Location(
                        player.getWorld(),
                        params.get("x").getAsDouble(),
                        params.get("y").getAsDouble(),
                        params.get("z").getAsDouble(),
                        player.getLocation().getYaw(),
                        player.getLocation().getPitch()
                    );
                    player.teleport(target);
                }
                break;
            }

            default:
                sendResult(actionId, false, "Unsupported action: " + action);
                return;
        }

        sendResult(actionId, true, null);
    }

    private void sendInventory(Player player) {
        if (wsClient == null || !wsClient.isOpen()) return;

        try {
            JsonObject root = new JsonObject();
            root.addProperty("type", "INVENTORY");

            JsonObject who = new JsonObject();
            who.addProperty("id", player.getUniqueId().toString());
            who.addProperty("name", player.getName());
            root.add("player", who);

            JsonArray containers = new JsonArray();

            // Armor order: helmet, chestplate, leggings, boots (Bukkit returns boots first)
            JsonArray armor = new JsonArray();
            ItemStack[] armorContents = player.getInventory().getArmorContents();
            int[] armorSlots = {39, 38, 37, 36};
            for (int i = 0; i < 4; i++) {
                int bukkitIndex = 3 - i;
                armor.add(serializeItem(armorContents.length > bukkitIndex ? armorContents[bukkitIndex] : null, armorSlots[i]));
            }
            containers.add(container("armor", armor));

            JsonArray offhand = new JsonArray();
            offhand.add(serializeItem(player.getInventory().getItemInOffHand(), 40));
            containers.add(container("offhand", offhand));

            JsonArray hotbar = new JsonArray();
            for (int i = 0; i < 9; i++) {
                hotbar.add(serializeItem(player.getInventory().getItem(i), i));
            }
            containers.add(container("hotbar", hotbar));

            JsonArray main = new JsonArray();
            for (int i = 9; i < 36; i++) {
                main.add(serializeItem(player.getInventory().getItem(i), i));
            }
            containers.add(container("main", main));

            root.add("containers", containers);
            wsClient.send(GSON.toJson(root));
        } catch (Exception e) {
            getLogger().warning("[Hosty Bridge] Error serializing inventory: " + e.getMessage());
        }
    }

    private static JsonObject container(String id, JsonArray slots) {
        JsonObject c = new JsonObject();
        c.addProperty("id", id);
        c.add("slots", slots);
        return c;
    }

    /** Returns a JSON slot or JsonNull for an empty slot. */
    private JsonElement serializeItem(ItemStack item, int index) {
        if (item == null || item.getType() == Material.AIR) {
            return com.google.gson.JsonNull.INSTANCE;
        }

        JsonObject io = new JsonObject();
        io.addProperty("index", index);
        io.addProperty("itemId", item.getType().getKey().toString());
        io.addProperty("count", item.getAmount());

        JsonObject metaOut = new JsonObject();
        ItemMeta meta = item.getItemMeta();
        if (meta != null) {
            if (meta.hasDisplayName()) {
                metaOut.addProperty("customName", meta.getDisplayName());
            }
            if (meta instanceof Damageable) {
                metaOut.addProperty("damage", ((Damageable) meta).getDamage());
                metaOut.addProperty("maxDamage", (int) item.getType().getMaxDurability());
            }
            if (meta.hasEnchants()) {
                JsonArray enchArr = new JsonArray();
                for (Map.Entry<Enchantment, Integer> entry : meta.getEnchants().entrySet()) {
                    JsonObject eo = new JsonObject();
                    eo.addProperty("id", entry.getKey().getKey().getKey());
                    eo.addProperty("level", entry.getValue());
                    enchArr.add(eo);
                }
                metaOut.add("enchantments", enchArr);
            }
        }
        io.add("meta", metaOut);
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
            event.getPlayer().sendMessage("§c[Hosty] You are currently muted by an administrator.");
        }
    }
}
