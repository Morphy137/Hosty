package com.mcnexus.bridge.fabric;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.server.MinecraftServer;

/**
 * Everything the bridge reads from or does to the game. Minecraft up to 1.21.x runs with intermediary names
 * ({@link YarnGameAccess}, compiled against Yarn); 26.x and later ship unobfuscated with Mojang names
 * ({@link MojangGameAccess}, resolved by reflection). Every method runs on the server thread.
 */
interface GameAccess {
    /** Short label for logs (e.g. "yarn" or "mojang"). */
    String name();

    /** `tps`, `mspt` and `loadedChunks` of the protocol's `server` telemetry object. */
    JsonObject serverTelemetry(MinecraftServer server);

    /** One protocol player object per online player. */
    JsonArray playersTelemetry(MinecraftServer server);

    /** Exact name of an online player matching `name`, or null when nobody by that name is online. */
    String onlinePlayerName(MinecraftServer server, String name);

    /** Runs a console command as the server (no leading slash). */
    void runCommand(MinecraftServer server, String command);

    /** `player` and `containers` of the protocol's INVENTORY frame, or null when the player is offline. */
    JsonObject inventory(MinecraftServer server, String playerName);

    /** Picks the implementation for the running game: Mojang names exist only on unobfuscated versions. */
    static GameAccess detect() {
        ClassLoader loader = NexusBridgeMod.class.getClassLoader();
        try {
            Class.forName("net.minecraft.server.level.ServerPlayer", false, loader);
            return new MojangGameAccess(loader);
        } catch (ClassNotFoundException e) {
            return new YarnGameAccess();
        }
    }
}
