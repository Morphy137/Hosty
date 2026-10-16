package com.mcnexus.bridge.fabric;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import net.minecraft.server.MinecraftServer;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Minecraft 26.x and later run unobfuscated with Mojang names, which a Yarn build cannot reference directly. The few
 * calls the bridge needs are resolved by name at runtime (verified against the 26.3 server jar). A missing method
 * surfaces as a {@link LinkageError} so the bridge switches itself off instead of breaking the server.
 */
final class MojangGameAccess implements GameAccess {
    private static final String[] ARMOR_SLOTS_HELMET_FIRST = {"HEAD", "CHEST", "LEGS", "FEET"};
    private static final int FIRST_ARMOR_INDEX = 39;
    private static final int OFFHAND_INDEX = 40;
    private static final int HOTBAR_SIZE = 9;
    private static final int INVENTORY_SIZE = 36;

    private final Map<String, Method> methods = new ConcurrentHashMap<>();
    private final Object[] armorSlots = new Object[ARMOR_SLOTS_HELMET_FIRST.length];
    private final Object itemRegistry;

    MojangGameAccess(ClassLoader loader) {
        try {
            Class<?> equipmentSlot = Class.forName("net.minecraft.world.entity.EquipmentSlot", false, loader);
            for (int i = 0; i < ARMOR_SLOTS_HELMET_FIRST.length; i++) {
                armorSlots[i] = equipmentSlot.getField(ARMOR_SLOTS_HELMET_FIRST[i]).get(null);
            }
            itemRegistry = Class.forName("net.minecraft.core.registries.BuiltInRegistries", true, loader).getField("ITEM").get(null);
        } catch (ReflectiveOperationException e) {
            throw incompatible("game classes", e);
        }
    }

    @Override
    public String name() {
        return "mojang";
    }

    @Override
    public JsonObject serverTelemetry(MinecraftServer server) {
        double mspt = Math.round(((Number) call(server, "getCurrentSmoothedTickTime")).doubleValue() * 10.0) / 10.0;
        int chunks = 0;
        for (Object level : (Iterable<?>) call(server, "getAllLevels")) {
            chunks += ((Number) call(call(level, "getChunkSource"), "getLoadedChunksCount")).intValue();
        }
        return Telemetry.server(mspt, chunks);
    }

    @Override
    public JsonArray playersTelemetry(MinecraftServer server) {
        Object playerList = call(server, "getPlayerList");
        JsonArray players = new JsonArray();
        for (Object p : (List<?>) call(playerList, "getPlayers")) {
            Object connection = field(p, "connection");
            Object dimension = call(call(p, "level"), "dimension");
            players.add(Telemetry.player(
                (String) call(p, "getStringUUID"),
                text(call(p, "getName")),
                connection == null ? 0 : ((Number) call(connection, "latency")).intValue(),
                ((Number) call(p, "getHealth")).floatValue(),
                ((Number) call(p, "getMaxHealth")).floatValue(),
                ((Number) call(p, "getX")).doubleValue(),
                ((Number) call(p, "getY")).doubleValue(),
                ((Number) call(p, "getZ")).doubleValue(),
                call(dimension, "identifier").toString(),
                ((Number) call(call(p, "getFoodData"), "getFoodLevel")).intValue(),
                (String) call(call(p, "gameMode"), "getName"),
                isOp(playerList, p)
            ));
        }
        return players;
    }

    @Override
    public String onlinePlayerName(MinecraftServer server, String name) {
        Object player = call(call(server, "getPlayerList"), "getPlayerByName", name);
        return player == null ? null : text(call(player, "getName"));
    }

    @Override
    public void runCommand(MinecraftServer server, String command) {
        call(call(server, "getCommands"), "performPrefixedCommand", call(server, "createCommandSourceStack"), command);
    }

    @Override
    public JsonObject inventory(MinecraftServer server, String playerName) {
        Object player = call(call(server, "getPlayerList"), "getPlayerByName", playerName);
        if (player == null) return null;
        Object inventory = call(player, "getInventory");

        JsonArray armor = new JsonArray();
        for (int i = 0; i < armorSlots.length; i++) {
            armor.add(slot(call(player, "getItemBySlot", armorSlots[i]), FIRST_ARMOR_INDEX - i));
        }
        JsonArray offhand = new JsonArray();
        offhand.add(slot(call(player, "getOffhandItem"), OFFHAND_INDEX));
        JsonArray hotbar = new JsonArray();
        for (int i = 0; i < HOTBAR_SIZE; i++) hotbar.add(slot(call(inventory, "getItem", i), i));
        JsonArray main = new JsonArray();
        for (int i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) main.add(slot(call(inventory, "getItem", i), i));

        return Telemetry.inventory((String) call(player, "getStringUUID"), text(call(player, "getName")), armor, offhand, hotbar, main);
    }

    /** Operator status changed shape across versions; it is informative only, so failures read as "not op". */
    private boolean isOp(Object playerList, Object player) {
        try {
            return Boolean.TRUE.equals(call(playerList, "isOp", call(player, "nameAndId")));
        } catch (LinkageError e) {
            return false;
        }
    }

    private JsonElement slot(Object stack, int index) {
        if (stack == null || Boolean.TRUE.equals(call(stack, "isEmpty"))) return JsonNull.INSTANCE;
        boolean damageable = Boolean.TRUE.equals(call(stack, "isDamageableItem"));
        Object customName = call(stack, "getCustomName");
        return Telemetry.slot(
            index,
            call(itemRegistry, "getKey", call(stack, "getItem")).toString(),
            ((Number) call(stack, "getCount")).intValue(),
            damageable ? ((Number) call(stack, "getDamageValue")).intValue() : null,
            damageable ? ((Number) call(stack, "getMaxDamage")).intValue() : null,
            customName == null ? null : text(customName)
        );
    }

    private String text(Object component) {
        return (String) call(component, "getString");
    }

    /** Invokes the public method `name` whose parameters accept `args`; reflection failures become LinkageErrors. */
    private Object call(Object target, String name, Object... args) {
        Method method = methods.computeIfAbsent(target.getClass().getName() + '#' + name + '/' + args.length,
            key -> findMethod(target.getClass(), name, args));
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof RuntimeException) throw (RuntimeException) cause;
            if (cause instanceof Error) throw (Error) cause;
            throw new IllegalStateException(cause);
        } catch (IllegalAccessException e) {
            throw incompatible(name, e);
        }
    }

    private static Method findMethod(Class<?> type, String name, Object[] args) {
        for (Method method : type.getMethods()) {
            if (!method.getName().equals(name) || method.getParameterCount() != args.length) continue;
            Class<?>[] params = method.getParameterTypes();
            boolean matches = true;
            for (int i = 0; i < params.length && matches; i++) {
                matches = args[i] == null ? !params[i].isPrimitive() : wrap(params[i]).isInstance(args[i]);
            }
            if (matches) {
                method.setAccessible(true);
                return method;
            }
        }
        throw new NoSuchMethodError(type.getName() + "." + name + " (" + args.length + " arguments)");
    }

    private static Object field(Object target, String name) {
        try {
            Field field = target.getClass().getField(name);
            return field.get(target);
        } catch (ReflectiveOperationException e) {
            throw incompatible(name, e);
        }
    }

    private static Class<?> wrap(Class<?> type) {
        if (!type.isPrimitive()) return type;
        if (type == int.class) return Integer.class;
        if (type == long.class) return Long.class;
        if (type == boolean.class) return Boolean.class;
        if (type == double.class) return Double.class;
        if (type == float.class) return Float.class;
        return type;
    }

    private static LinkageError incompatible(String what, Throwable cause) {
        LinkageError error = new LinkageError("Unsupported Minecraft version: cannot use " + what);
        error.initCause(cause);
        return error;
    }
}
