---
name: Frida Debugging
description: Dynamic instrumentation with Frida for iOS reverse engineering. Hook functions, trace execution, and analyze runtime behavior.
---

# Frida Debugging

> Dynamic instrumentation framework for iOS reverse engineering and debugging

## Core Concepts

- **Runtime modification**: Change behavior without recompiling
- **Non-invasive**: No binary patching required
- **Scriptable**: JavaScript-based hooking
- **Real-time**: Inspect and modify at runtime

---

## Setup

### Installation

```bash
# Install Frida tools
pip3 install frida-tools

# Check version
frida --version

# List devices
frida-ls-devices
```

### iOS Requirements

- Jailbroken device
- Frida server installed on device
- USB or WiFi connection

---

## Basic Hooking

### Hook Objective-C Method

```javascript
// Hook instance method
var className = "ClassName";
var methodName = "- methodName:";

var hook = ObjC.classes[className][methodName];
Interceptor.attach(hook.implementation, {
  onEnter: function (args) {
    console.log("[+] Called: " + methodName);
    console.log("    self: " + args[0]);
    console.log("    selector: " + args[1]);
    console.log("    arg1: " + args[2]);
  },
  onLeave: function (retval) {
    console.log("[+] Return: " + retval);
  },
});
```

### Hook C Function

```javascript
// Hook by address
var baseAddr = Module.findBaseAddress("UnityFramework");
var targetAddr = baseAddr.add(0x570dfd8);

Interceptor.attach(targetAddr, {
  onEnter: function (args) {
    console.log("[+] Function called");
    console.log("    X0: " + args[0]);
    console.log("    X1: " + args[1]);

    // Modify arguments
    args[1] = ptr(0x1234);
  },
  onLeave: function (retval) {
    console.log("[+] Return: " + retval);

    // Modify return value
    retval.replace(ptr(0x5678));
  },
});
```

---

## Memory Operations

### Read Memory

```javascript
// Read pointer
var addr = ptr("0x12345678");
var value = addr.readPointer();
console.log("Value: " + value);

// Read different types
var u32 = addr.readU32(); // Unsigned 32-bit
var s64 = addr.readS64(); // Signed 64-bit
var float = addr.readFloat(); // Float
var str = addr.readUtf8String(); // String
```

### Write Memory

```javascript
// Write pointer
addr.writePointer(ptr("0xABCD"));

// Write different types
addr.writeU32(0x1234);
addr.writeS64(-1);
addr.writeFloat(3.14);
addr.writeUtf8String("Hello");
```

### Memory Scanning

```javascript
// Scan for pattern
Memory.scan(baseAddr, size, "FF EE DD CC", {
  onMatch: function (address, size) {
    console.log("[+] Found at: " + address);
  },
  onComplete: function () {
    console.log("[+] Scan complete");
  },
});
```

---

## Module Operations

### Find Module

```javascript
// Get base address
var base = Module.findBaseAddress("UnityFramework");
console.log("Base: " + base);

// Get module info
var module = Process.findModuleByName("UnityFramework");
console.log("Base: " + module.base);
console.log("Size: " + module.size);
console.log("Path: " + module.path);
```

### Find Export

```javascript
// Find exported function
var funcAddr = Module.findExportByName(
  "UnityFramework",
  "UnityGetRenderingResolution",
);
console.log("Function: " + funcAddr);
```

### Enumerate Modules

```javascript
Process.enumerateModules({
  onMatch: function (module) {
    console.log("Name: " + module.name);
    console.log("Base: " + module.base);
    console.log("Size: " + module.size);
  },
  onComplete: function () {
    console.log("Done");
  },
});
```

---

## Advanced Hooking

### Replace Function

```javascript
// Replace entire function
Interceptor.replace(
  targetAddr,
  new NativeCallback(
    function (arg1, arg2) {
      console.log("[+] Custom implementation");
      console.log("    arg1: " + arg1);
      console.log("    arg2: " + arg2);

      // Custom logic
      return ptr(0x1234);
    },
    "pointer",
    ["pointer", "pointer"],
  ),
);
```

### Inline Hooking

```javascript
// Hook at specific offset
var hookAddr = baseAddr.add(0x123456);

Interceptor.attach(hookAddr, {
  onEnter: function (args) {
    // Read registers
    console.log("X0: " + this.context.x0);
    console.log("X1: " + this.context.x1);
    console.log("PC: " + this.context.pc);
    console.log("SP: " + this.context.sp);
    console.log("LR: " + this.context.lr);

    // Modify registers
    this.context.x0 = ptr(0x5678);
  },
});
```

### Conditional Hooking

```javascript
Interceptor.attach(targetAddr, {
  onEnter: function (args) {
    // Only log if condition met
    if (args[0].toInt32() > 100) {
      console.log("[+] Condition met!");
      console.log("    arg0: " + args[0]);
    }
  },
});
```

---

## Tracing

### Trace Function Calls

```javascript
// Trace all calls to function
Interceptor.attach(targetAddr, {
  onEnter: function (args) {
    console.log("\n[TRACE] " + targetAddr);
    console.log("  Called from: " + this.returnAddress);
    console.log("  Backtrace:");
    console.log(
      Thread.backtrace(this.context, Backtracer.ACCURATE)
        .map(DebugSymbol.fromAddress)
        .join("\n"),
    );
  },
});
```

### Trace Memory Access

```javascript
// Watch memory region
MemoryAccessMonitor.enable(
  [
    {
      base: ptr("0x12345000"),
      size: 0x1000,
    },
  ],
  {
    onAccess: function (details) {
      console.log("[MEM] " + details.operation);
      console.log("  Address: " + details.address);
      console.log("  From: " + details.from);
      console.log("  PC: " + details.pc);
    },
  },
);
```

---

## Debugging Workflows

### Workflow 1: Find Function Address

```javascript
// 1. Enumerate exports
Module.enumerateExports("UnityFramework", {
  onMatch: function (exp) {
    if (exp.name.indexOf("Actor") !== -1) {
      console.log(exp.name + " @ " + exp.address);
    }
  },
  onComplete: function () {},
});

// 2. Search by pattern
var pattern = "FF 43 01 D1 F4 4F 01 A9";
Memory.scan(baseAddr, size, pattern, {
  onMatch: function (address) {
    console.log("Found: " + address);
  },
  onComplete: function () {},
});
```

### Workflow 2: Analyze Function Behavior

```javascript
var callCount = 0;
var argValues = [];

Interceptor.attach(targetAddr, {
  onEnter: function (args) {
    callCount++;
    argValues.push({
      x0: args[0].toString(),
      x1: args[1].toString(),
      x2: args[2].toString(),
    });

    if (callCount % 100 === 0) {
      console.log("[STATS] Calls: " + callCount);
      console.log(
        "  Unique X0 values: " + new Set(argValues.map((a) => a.x0)).size,
      );
    }
  },
});
```

### Workflow 3: Bypass Security Check

```javascript
// Find security check function
var checkAddr = Module.findExportByName(
  "libsecurity.dylib",
  "verify_signature",
);

// Always return success
Interceptor.replace(
  checkAddr,
  new NativeCallback(
    function () {
      console.log("[+] Security check bypassed");
      return 1; // Success
    },
    "int",
    [],
  ),
);
```

---

## iOS-Specific Techniques

### Hook Objective-C Method Swizzling

```javascript
// Swizzle method
var className = "UIViewController";
var methodName = "- viewDidLoad";

var originalImpl = ObjC.classes[className][methodName].implementation;

ObjC.classes[className][methodName].implementation = ObjC.implement(
  ObjC.classes[className][methodName],
  function (handle, selector) {
    console.log("[+] viewDidLoad called");

    // Call original
    originalImpl(handle, selector);

    console.log("[+] viewDidLoad done");
  },
);
```

### Enumerate Classes

```javascript
// Find classes matching pattern
for (var className in ObjC.classes) {
  if (className.indexOf("Security") !== -1) {
    console.log(className);

    // List methods
    ObjC.classes[className].$ownMethods.forEach(function (method) {
      console.log("  " + method);
    });
  }
}
```

---

## Script Templates

### Template 1: Basic Hook

```javascript
// basic_hook.js
console.log("[*] Script loaded");

var moduleName = "UnityFramework";
var offset = 0x570dfd8;

var base = Module.findBaseAddress(moduleName);
if (!base) {
  console.log("[-] Module not found: " + moduleName);
} else {
  var target = base.add(offset);
  console.log("[+] Hooking: " + target);

  Interceptor.attach(target, {
    onEnter: function (args) {
      console.log("[CALL] " + target);
      console.log("  X0: " + args[0]);
      console.log("  X1: " + args[1]);
    },
    onLeave: function (retval) {
      console.log("[RET] " + retval);
    },
  });
}
```

### Template 2: Trace All Calls

```javascript
// trace_all.js
var targets = [
  { name: "get_actorHp", offset: 0x570dfd8 },
  { name: "get_main", offset: 0x5707c24 },
  { name: "WorldToViewportPoint", offset: 0x4d1f1f8 },
];

var base = Module.findBaseAddress("UnityFramework");

targets.forEach(function (t) {
  var addr = base.add(t.offset);
  console.log("[+] Hooking: " + t.name + " @ " + addr);

  Interceptor.attach(addr, {
    onEnter: function (args) {
      console.log("\n[" + t.name + "]");
      console.log("  Args: " + args[0] + ", " + args[1]);
    },
  });
});
```

---

## CLI Usage

### Attach to Process

```bash
# By name
frida -U -n "kgvn" -l script.js

# By PID
frida -U -p 12345 -l script.js

# Spawn and attach
frida -U -f com.garena.game.kgvn -l script.js
```

### Interactive REPL

```bash
# Start REPL
frida -U -n "kgvn"

# In REPL
[Local::kgvn]-> Process.enumerateModules()
[Local::kgvn]-> Module.findBaseAddress("UnityFramework")
```

### Save Output

```bash
# Log to file
frida -U -n "kgvn" -l script.js > output.log 2>&1
```

---

## Troubleshooting

### Common Issues

#### Module Not Found

```javascript
// Wait for module to load
var checkModule = setInterval(function () {
  var base = Module.findBaseAddress("UnityFramework");
  if (base) {
    console.log("[+] Module loaded: " + base);
    clearInterval(checkModule);

    // Hook here
  }
}, 100);
```

#### Hook Not Triggering

```javascript
// Verify address
var addr = base.add(offset);
console.log("Hooking: " + addr);

// Check if code
var insn = Instruction.parse(addr);
console.log("Instruction: " + insn);

// Verify module range
var module = Process.findModuleByAddress(addr);
console.log("Module: " + module.name);
```

---

## Best Practices

### ✅ Do:

- Verify module is loaded before hooking
- Use try-catch for error handling
- Log important events
- Clean up hooks when done
- Test incrementally

### ❌ Don't:

- Hook too many functions (performance)
- Modify memory without backup
- Ignore error messages
- Use hardcoded addresses (ASLR!)
- Forget to detach hooks

---

## When to Use This Skill

- Finding function addresses dynamically
- Analyzing runtime behavior
- Bypassing security checks
- Debugging without source code
- Prototyping patches before binary modification
- Reverse engineering iOS apps

---

## Related Skills

- `ios-binary-patching` - Static patching
- `arm64-assembly` - Understanding hooked code
- `crash-log-analysis` - Debugging crashes
- `ios-reverse-engineering` - RE methodology
