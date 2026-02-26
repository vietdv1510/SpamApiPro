---
name: ios-tweak-development
description: Industry-standard tweak development using Theos, Logos, and modern hooking frameworks.
allowed-tools: Read, Write, Edit, Bash
skills:
  - arm64-assembly
  - ios-binary-patching
---

# 🛠️ Professional iOS Tweak Development (2025-2026 Edition)

> Write efficient, stable, and powerful tweaks with Theos/Logos and modern alternatives.
> Sources: theos.dev, iPhone Dev Wiki, iphonedev.wiki, GitHub/theos

---

## 1. Development Environment Setup

### Install Theos (macOS)

```bash
# Install dependencies
xcode-select --install
brew install dpkg ldid make

# Clone Theos
export THEOS=~/theos
git clone --recursive https://github.com/theos/theos.git $THEOS

# Add to shell profile
echo 'export THEOS=~/theos' >> ~/.zshrc
echo 'export PATH=$THEOS/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

# Download iOS SDK (Required for compilation)
cd $THEOS/sdks
curl -LO https://github.com/theos/sdks/releases/download/master/iPhoneOS16.5.sdk.tar.xz
tar -xf iPhoneOS16.5.sdk.tar.xz
```

### Create New Project

```bash
$THEOS/bin/nic.pl
# Select: [11] iphone/tweak
# Project Name: MyTweak
# Bundle Filter: com.company.app (or leave blank for all apps)
```

---

## 2. Logos Syntax Cheat Sheet

| Directive     | Purpose                     | Example                                        |
| ------------- | --------------------------- | ---------------------------------------------- |
| `%hook Class` | Start hooking a class       | `%hook Player`                                 |
| `%end`        | End hook block              |                                                |
| `%orig`       | Call original method        | `return %orig * 2;`                            |
| `%orig(args)` | Original with modified args | `%orig(999);`                                  |
| `%new`        | Add new method to class     | `%new - (void)myMethod {}`                     |
| `%property`   | Add new property            | `%property (nonatomic, assign) BOOL isModded;` |
| `%ctor`       | Constructor (runs on load)  | `%ctor { NSLog(@"Loaded!"); }`                 |
| `%dtor`       | Destructor                  | `%dtor { }`                                    |
| `%init`       | Initialize hooks            | `%init;` or `%init(GroupName);`                |
| `%group`      | Group hooks                 | `%group Tweaks ... %end`                       |
| `%hookf`      | Hook C function             | `%hookf(int, open, ...) { }`                   |
| `%subclass`   | Create new subclass         | `%subclass MyClass : NSObject`                 |

---

## 3. Production-Ready Makefile

```makefile
# Makefile for Modern iOS Tweak (2025)

export ARCHS = arm64 arm64e
export TARGET = iphone:clang:16.5:15.0
export SYSROOT = $(THEOS)/sdks/iPhoneOS16.5.sdk

# For rootless jailbreaks (Dopamine, Palera1n)
export THEOS_PACKAGE_SCHEME = rootless

INSTALL_TARGET_PROCESSES = SpringBoard

TWEAK_NAME = MyAwesomeTweak

$(TWEAK_NAME)_FILES = Tweak.x Hooks.xm Utils.m
$(TWEAK_NAME)_CFLAGS = -fobjc-arc -Wno-deprecated-declarations -Wno-unused-variable
$(TWEAK_NAME)_CCFLAGS = -std=c++17
$(TWEAK_NAME)_FRAMEWORKS = UIKit Foundation Security
$(TWEAK_NAME)_PRIVATE_FRAMEWORKS =
$(TWEAK_NAME)_LIBRARIES = substrate

# Optimization flags for production
$(TWEAK_NAME)_CFLAGS += -O2 -DNDEBUG

include $(THEOS)/makefiles/common.mk
include $(THEOS_MAKE_PATH)/tweak.mk

# Clean and rebuild
clean::
	rm -rf .theos packages

# Build for sideloading (non-jailbreak)
sideload: stage
	@echo "Creating IPA-compatible dylib..."
	@cp $(THEOS_STAGING_DIR)/Library/MobileSubstrate/DynamicLibraries/$(TWEAK_NAME).dylib ./
```

---

## 4. control File Template

```
Package: com.yourname.mytweak
Name: My Awesome Tweak
Version: 1.0.0
Architecture: iphoneos-arm64
Description: A professional tweak that modifies app behavior.
Maintainer: Your Name <your@email.com>
Author: Your Name
Section: Tweaks
Depends: mobilesubstrate (>= 0.9.5000)
Conflicts:
Replaces:
Tag: purpose::extension, role::enduser
```

---

## 5. Common Hooking Patterns

### Hook Instance Method

```objc
%hook Player
- (int)getHealth {
    return 99999; // God mode
}

- (void)takeDamage:(int)damage {
    // Don't call %orig = no damage taken
    NSLog(@"Blocked %d damage", damage);
}

- (float)getSpeed {
    return %orig * 2.0f; // 2x speed
}
%end
```

### Hook Class Method

```objc
%hook GameManager
+ (BOOL)isProVersion {
    return YES;
}

+ (instancetype)sharedInstance {
    GameManager *manager = %orig;
    [manager setValue:@YES forKey:@"_unlocked"];
    return manager;
}
%end
```

### Hook C Function

```objc
%hookf(int, open, const char *path, int flags, ...) {
    NSLog(@"Opening: %s", path);
    return %orig;
}

%hookf(void*, dlopen, const char *path, int mode) {
    if (path && strstr(path, "anticheat")) {
        return NULL; // Block anti-cheat library
    }
    return %orig;
}
```

### Hook with MSHookFunction (Direct)

```objc
#include <substrate.h>

static void (*orig_gameLoop)(void);
void new_gameLoop(void) {
    // Custom logic before
    orig_gameLoop();
    // Custom logic after
}

%ctor {
    void *addr = (void *)0x100123456; // Offset from binary
    MSHookFunction(addr, (void *)new_gameLoop, (void **)&orig_gameLoop);
}
```

---

## 6. Best Practices for Stability

### Always Check for nil

```objc
%hook SomeClass
- (void)someMethod:(id)object {
    if (!object) {
        %orig;
        return;
    }
    // Safe to use object
    %orig;
}
%end
```

### Thread Safety for UI

```objc
%hook ViewController
- (void)updateLabel {
    dispatch_async(dispatch_get_main_queue(), ^{
        // UI updates must be on main thread
        self.label.text = @"Modified!";
    });
    %orig;
}
%end
```

### Conditional Hooks with Groups

```objc
%group EnabledTweaks
%hook Player
- (int)getCoins { return 999999; }
%end
%end

%group DisabledTweaks
// Alternative hooks
%end

%ctor {
    BOOL tweakEnabled = [[NSUserDefaults standardUserDefaults] boolForKey:@"TweakEnabled"];
    if (tweakEnabled) {
        %init(EnabledTweaks);
    } else {
        %init(DisabledTweaks);
    }
}
```

---

## 7. Building Mod Menu UI

### Simple Toggle with UIAlertController

```objc
%hook ViewController
- (void)viewDidAppear:(BOOL)animated {
    %orig;

    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        UIAlertController *alert = [UIAlertController
            alertControllerWithTitle:@"Mod Menu"
            message:@"Select options"
            preferredStyle:UIAlertControllerStyleActionSheet];

        [alert addAction:[UIAlertAction
            actionWithTitle:@"God Mode: ON"
            style:UIAlertActionStyleDefault
            handler:^(UIAlertAction *action) {
                godModeEnabled = YES;
            }]];

        [alert addAction:[UIAlertAction
            actionWithTitle:@"Cancel"
            style:UIAlertActionStyleCancel
            handler:nil]];

        [self presentViewController:alert animated:YES completion:nil];
    });
}
%end
```

### Floating Button

```objc
static UIButton *modButton;

%hook UIWindow
- (void)makeKeyAndVisible {
    %orig;

    if (!modButton) {
        modButton = [UIButton buttonWithType:UIButtonTypeSystem];
        modButton.frame = CGRectMake(20, 100, 60, 60);
        modButton.backgroundColor = [UIColor colorWithRed:0 green:0.5 blue:1 alpha:0.8];
        modButton.layer.cornerRadius = 30;
        [modButton setTitle:@"MOD" forState:UIControlStateNormal];
        [modButton setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
        [modButton addTarget:self action:@selector(showModMenu) forControlEvents:UIControlEventTouchUpInside];
        [self addSubview:modButton];
    }
}

%new
- (void)showModMenu {
    // Show mod menu
}
%end
```

---

## 8. Debugging Tips

```objc
// Use NSLog for debugging (remove in production!)
NSLog(@"[MyTweak] Method called with: %@", object);

// Print stack trace
NSLog(@"[MyTweak] Stack: %@", [NSThread callStackSymbols]);

// Check class name
NSLog(@"[MyTweak] Class: %@", NSStringFromClass([object class]));

// Use lldb attach
// In terminal: debugserver *:1234 -a <pid>
// Then: lldb -> process connect connect://localhost:1234
```

---

## 9. Alternative: Orion (Swift-based)

For Swift apps or cleaner syntax:

```swift
import Orion
import UIKit

class PlayerHook: ClassHook<NSObject> {
    static let targetName = "Player"

    func getHealth() -> Int {
        return 99999
    }

    func getCoins() -> Int {
        return 999999
    }
}

struct MyTweak: Tweak {
    init() {
        // Initialization
    }
}
```

---

> **Pro Tip:** Use `make package FINALPACKAGE=1` for release builds with optimizations.
