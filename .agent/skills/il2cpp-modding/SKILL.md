---
name: il2cpp-modding
description: Advanced IL2CPP reverse engineering and modding for Unity games on iOS/Android.
allowed-tools: Read, Write, Edit, Bash, Frida
skills:
  - frida-debugging
  - arm64-assembly
  - ios-binary-patching
---

# 🎮 IL2CPP Modding Pro (2025-2026 Edition)

> Master the art of reversing and patching Unity games optimized with IL2CPP.
> Sources: GitHub (Perfare/Il2CppDumper, vfsfitvnm/frida-il2cpp-bridge), iOSGods, PlatinMods, UnknownCheats

---

## 1. Core Workflow (2025 Standard)

| Step                 | Action                         | Tool (Recommended)                              |
| -------------------- | ------------------------------ | ----------------------------------------------- |
| **1. Decrypt IPA**   | Remove FairPlay DRM            | `frida-ios-dump`, `bagbak`, `CrackerXI+`        |
| **2. Dump Metadata** | Extract method names & offsets | `Il2CppDumper`, `Il2CppInspectorPro 2025`       |
| **3. Runtime Dump**  | Bypass encrypted metadata      | `frida-il2cpp-bridge` (NO metadata.dat needed!) |
| **4. Analyze**       | Understand game logic          | `Ghidra` + `Il2CppInspector headers`, `IDA Pro` |
| **5. Hook/Patch**    | Modify game behavior           | `Dobby`, `MelonLoader`, `BepInEx`               |

---

## 2. Tool Arsenal (2025-2026)

### Tier 1: Essential Tools

| Tool                    | Purpose                        | Link                                     |
| ----------------------- | ------------------------------ | ---------------------------------------- |
| **Il2CppDumper**        | Extract dump.cs, dummy DLLs    | github.com/Perfare/Il2CppDumper          |
| **frida-il2cpp-bridge** | Runtime dump WITHOUT metadata  | github.com/vfsfitvnm/frida-il2cpp-bridge |
| **Il2CppInspectorPro**  | Generate C++ headers, C# stubs | Enhanced version for Unity 2023+         |
| **Ghidra**              | Free disassembler (NSA)        | ghidra-sre.org                           |

### Tier 2: Modding Frameworks

| Framework       | Platform                       | Best For                       |
| --------------- | ------------------------------ | ------------------------------ |
| **MelonLoader** | PC, Android (experimental iOS) | C# mod injection with HarmonyX |
| **BepInEx**     | PC, Android                    | Plugin ecosystem               |
| **Theos/Logos** | iOS (Jailbreak)                | Native Objective-C/Swift hooks |
| **Dobby**       | iOS/Android                    | C++ inline hooking             |

---

## 3. Key Target Methods for Game Modding

| Method Pattern               | Hack Type          | Implementation          |
| ---------------------------- | ------------------ | ----------------------- |
| `get_IsVip()`                | Unlock Premium     | `return true;`          |
| `get_Gold()` / `get_Coins()` | Unlimited Currency | `return 999999999;`     |
| `get_Cooldown()`             | No Cooldown        | `return 0.0f;`          |
| `TakeDamage()`               | God Mode           | `return;` (skip damage) |
| `get_Speed()`                | Speed Hack         | `return %orig * 2.0f;`  |
| `CanPurchase()`              | Free Purchase      | `return true;`          |
| `IsAdReady()`                | Remove Ads         | `return false;`         |
| `ValidateLicense()`          | Crack License      | `return true;`          |

---

## 4. frida-il2cpp-bridge (RECOMMENDED 2025)

This tool can dump IL2CPP games at runtime **without needing global-metadata.dat** - perfect for encrypted games!

### Installation

```bash
npm install frida-il2cpp-bridge
```

### Usage Script (TypeScript)

```typescript
// dump_game.ts - Run: frida -U -f com.game.bundle -l dump_game.js
import "frida-il2cpp-bridge";

Il2Cpp.perform(() => {
  // Dump all classes and methods
  Il2Cpp.dump("dump.cs");

  // Find specific class
  const Player = Il2Cpp.domain
    .assembly("Assembly-CSharp")
    .image.class("Player");

  // Hook method
  Player.method("get_IsVip").implementation = function () {
    return true; // Always VIP
  };

  // Hook with original call
  Player.method("TakeDamage").implementation = function (damage: number) {
    console.log(`Damage blocked: ${damage}`);
    return; // God mode - skip damage
  };

  // Modify field directly
  const player = Il2Cpp.gc.choose(Player)[0];
  player.field("_gold").value = 999999999;
});
```

---

## 5. Dealing with Protected Metadata (2025 Techniques)

Modern games encrypt `global-metadata.dat`. Solutions:

### Method A: In-Memory Dump with Frida

```javascript
// Wait for game to decrypt metadata, then dump
Interceptor.attach(Module.findExportByName("UnityFramework", "il2cpp_init"), {
  onLeave: function (retval) {
    // Metadata is now decrypted in memory
    var metadataBase = Module.findExportByName(
      "UnityFramework",
      "g_MetadataUsages",
    );
    if (metadataBase) {
      console.log("[+] Metadata found at: " + metadataBase);
      // Dump using Memory.readByteArray
    }
  },
});
```

### Method B: Use frida-il2cpp-bridge (Recommended)

Does not require metadata file at all - parses IL2CPP structures directly from memory.

### Method C: Patch CRC Check

Find and NOP the integrity verification function before game loads.

---

## 6. AOB Pattern Scanning (Version-Independent Hooking)

When offsets change between game versions, use byte patterns:

```cpp
#include <mach-o/dyld.h>
#include <string.h>

void* aob_scan(const char* pattern, const char* mask, void* start, size_t size) {
    for (size_t i = 0; i < size - strlen(mask); i++) {
        bool found = true;
        for (size_t j = 0; mask[j]; j++) {
            if (mask[j] == 'x' && ((uint8_t*)start)[i+j] != (uint8_t)pattern[j]) {
                found = false;
                break;
            }
        }
        if (found) return (void*)((uintptr_t)start + i);
    }
    return nullptr;
}

// Usage: Find "mov w0, #1; ret" pattern
void* addr = aob_scan("\x20\x00\x80\x52\xC0\x03\x5F\xD6", "xxxxxxxx", base, size);
```

---

## 7. Common Bypass Patterns

### Bypass Server Validation

If the game validates purchases server-side:

1. Hook the **response parsing** function
2. Modify the response to always return "success"
3. Or use Charles Proxy to rewrite server responses

### Bypass Time Checks (Energy Systems)

```typescript
Il2Cpp.perform(() => {
  const DateTime = Il2Cpp.corlib.class("System.DateTime");
  DateTime.method("get_Now").implementation = function () {
    // Return a fixed time or add hours
    return this.method("AddHours").invoke(24);
  };
});
```

---

## 8. Security & Anti-Detect Measures

- **Rename your dylib:** Don't use obvious names like "Hack.dylib"
- **Strip debug symbols:** `strip -x YourTweak.dylib`
- **Check for anti-cheat hooks:** Many games hook `dlopen`, `mmap` to detect injections
- **Use method swizzling:** Sometimes safer than direct memory patching

---

> **Pro Tip:** Start with `frida-il2cpp-bridge` for quick analysis. If you need persistent mods, switch to Theos/Dobby for native implementation.
