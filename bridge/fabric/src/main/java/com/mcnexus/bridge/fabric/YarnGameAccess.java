package com.mcnexus.bridge.fabric;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;

/** Direct calls compiled against Yarn: Minecraft 1.20.x - 1.21.x (intermediary runtime names). */
final class YarnGameAccess implements GameAccess {
    @Override
    public String name() {
        return "yarn";
    }

    @Override
    public JsonObject serverTelemetry(MinecraftServer server) {
        double mspt = Math.round(server.getAverageTickTime() * 10.0) / 10.0;
        int chunks = 0;
        for (ServerWorld world : server.getWorlds()) {
            chunks += world.getChunkManager().getLoadedChunkCount();
        }
        return Telemetry.server(mspt, chunks);
    }

    @Override
    public JsonArray playersTelemetry(MinecraftServer server) {
        JsonArray players = new JsonArray();
        for (ServerPlayerEntity p : server.getPlayerManager().getPlayerList()) {
            boolean isOp = server.getPlayerManager().isOperator(p.getGameProfile());
            players.add(Telemetry.player(
                p.getUuidAsString(),
                p.getName().getString(),
                p.networkHandler != null ? p.networkHandler.getLatency() : 0,
                p.getHealth(),
                p.getMaxHealth(),
                p.getX(), p.getY(), p.getZ(),
                p.getWorld().getRegistryKey().getValue().toString(),
                p.getHungerManager().getFoodLevel(),
                p.interactionManager.getGameMode().getName(),
                isOp
            ));
        }
        return players;
    }

    @Override
    public String onlinePlayerName(MinecraftServer server, String name) {
        ServerPlayerEntity player = server.getPlayerManager().getPlayer(name);
        return player == null ? null : player.getName().getString();
    }

    @Override
    public void runCommand(MinecraftServer server, String command) {
        server.getCommandManager().executeWithPrefix(server.getCommandSource(), command);
    }

    @Override
    public JsonObject inventory(MinecraftServer server, String playerName) {
        ServerPlayerEntity player = server.getPlayerManager().getPlayer(playerName);
        if (player == null) return null;

        JsonArray armor = new JsonArray();
        // getArmorStack: 0 = boots ... 3 = helmet; the protocol lists helmet first.
        for (int i = 3; i >= 0; i--) armor.add(slot(player.getInventory().getArmorStack(i), 36 + i));
        JsonArray offhand = new JsonArray();
        offhand.add(slot(player.getOffHandStack(), 40));
        JsonArray hotbar = new JsonArray();
        for (int i = 0; i < 9; i++) hotbar.add(slot(player.getInventory().getStack(i), i));
        JsonArray main = new JsonArray();
        for (int i = 9; i < 36; i++) main.add(slot(player.getInventory().getStack(i), i));

        return Telemetry.inventory(player.getUuidAsString(), player.getName().getString(), armor, offhand, hotbar, main);
    }

    private static JsonElement slot(ItemStack stack, int index) {
        if (stack == null || stack.isEmpty()) return JsonNull.INSTANCE;
        return Telemetry.slot(
            index,
            Registries.ITEM.getId(stack.getItem()).toString(),
            stack.getCount(),
            stack.isDamageable() ? stack.getDamage() : null,
            stack.isDamageable() ? stack.getMaxDamage() : null,
            customName(stack)
        );
    }

    /** False once `ItemStack.hasCustomName` proved missing (Minecraft 1.20.5+ moved names into item components). */
    private static volatile boolean hasCustomNameAvailable = true;

    /**
     * The name the player gave the stack, or null. Cosmetic, so it must never break an inventory read: where the
     * direct call does not exist the name is compared with the item's default one instead.
     */
    private static String customName(ItemStack stack) {
        if (hasCustomNameAvailable) {
            try {
                return stack.hasCustomName() ? stack.getName().getString() : null;
            } catch (LinkageError missing) {
                hasCustomNameAvailable = false;
            }
        }
        String shown = stack.getName().getString();
        String standard = stack.getItem().getName().getString();
        return shown.equals(standard) ? null : shown;
    }
}
