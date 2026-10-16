package com.mcnexus.bridge.fabric;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

/** Builds the protocol v1 JSON shapes (docs/bridge-protocol.md) independently of the game's names. */
final class Telemetry {
    private static final double MAX_TPS = 20.0;
    private static final double MS_PER_SECOND = 1000.0;

    private Telemetry() {
    }

    static JsonObject server(double mspt, int loadedChunks) {
        JsonObject server = new JsonObject();
        server.addProperty("tps", Math.min(MAX_TPS, mspt > 0 ? Math.round(MS_PER_SECOND / mspt * 100.0) / 100.0 : MAX_TPS));
        server.addProperty("mspt", mspt);
        server.addProperty("loadedChunks", loadedChunks);
        return server;
    }

    static JsonObject player(
        String id, String name, int ping, float health, float maxHealth,
        double x, double y, double z, String world, int food, String gamemode, boolean isOp
    ) {
        JsonObject player = new JsonObject();
        player.addProperty("id", id);
        player.addProperty("name", name);
        player.addProperty("ping", ping);
        player.addProperty("health", Math.round(health * 10.0) / 10.0);
        player.addProperty("maxHealth", (double) maxHealth);

        JsonObject position = new JsonObject();
        position.addProperty("x", Math.round(x * 10.0) / 10.0);
        position.addProperty("y", Math.round(y * 10.0) / 10.0);
        position.addProperty("z", Math.round(z * 10.0) / 10.0);
        position.addProperty("world", world);
        player.add("position", position);

        JsonObject stats = new JsonObject();
        stats.addProperty("food", food);
        stats.addProperty("gamemode", gamemode);
        stats.addProperty("isOp", isOp);
        player.add("stats", stats);
        return player;
    }

    static JsonObject slot(int index, String itemId, int count, Integer damage, Integer maxDamage, String customName) {
        JsonObject slot = new JsonObject();
        slot.addProperty("index", index);
        slot.addProperty("itemId", itemId);
        slot.addProperty("count", count);
        JsonObject meta = new JsonObject();
        if (damage != null && maxDamage != null) {
            meta.addProperty("damage", damage);
            meta.addProperty("maxDamage", maxDamage);
        }
        if (customName != null) meta.addProperty("customName", customName);
        slot.add("meta", meta);
        return slot;
    }

    static JsonObject inventory(String id, String name, JsonArray armor, JsonArray offhand, JsonArray hotbar, JsonArray main) {
        JsonObject root = new JsonObject();
        JsonObject who = new JsonObject();
        who.addProperty("id", id);
        who.addProperty("name", name);
        root.add("player", who);

        JsonArray containers = new JsonArray();
        containers.add(container("armor", armor));
        containers.add(container("offhand", offhand));
        containers.add(container("hotbar", hotbar));
        containers.add(container("main", main));
        root.add("containers", containers);
        return root;
    }

    private static JsonObject container(String id, JsonArray slots) {
        JsonObject container = new JsonObject();
        container.addProperty("id", id);
        container.add("slots", slots);
        return container;
    }
}
