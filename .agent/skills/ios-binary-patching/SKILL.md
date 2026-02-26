---
name: macho-dylib-injection
description: Deep binary manipulation, Mach-O structure analysis, and dylib injection techniques for iOS.
allowed-tools: Read, Write, Edit, Bash
skills:
  - arm64-assembly
  - ios-tweak-development
---

# 🚀 Advanced Mach-O & Binary Patching (2025-2026 Edition)

> Manipulate iOS binaries like a pro - injection, patching, and sideloading.
> Sources: Apple Developer Documentation, MachO-Kit, LIEF Documentation, optool

---

## 1. Mach-O Structure Deep Dive

```
┌─────────────────────────────────────┐
│         Mach-O Header               │  <- Magic, CPU type, file type
├─────────────────────────────────────┤
│         Load Commands               │  <- Instructions for loader
│  ┌─────────────────────────────┐    │
│  │ LC_SEGMENT_64 (__TEXT)      │    │  <- Code segment
│  │ LC_SEGMENT_64 (__DATA)      │    │  <- Data segment
│  │ LC_LOAD_DYLIB               │    │  <- External libraries
│  │ LC_CODE_SIGNATURE           │    │  <- Code signature
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│         __TEXT Segment              │  <- Executable code (read-only)
│  ┌─────────────────────────────┐    │
│  │ __text (machine code)       │    │
│  │ __stubs (plt stubs)         │    │
│  │ __cstring (C strings)       │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│         __DATA Segment              │  <- Writable data
│  ┌─────────────────────────────┐    │
│  │ __data (initialized data)   │    │
│  │ __bss (uninitialized)       │    │
│  │ __objc_* (ObjC metadata)    │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│         __LINKEDIT                  │  <- Symbol tables, signatures
└─────────────────────────────────────┘
```

---

## 2. Essential Tools

| Tool             | Purpose                    | Installation          |
| ---------------- | -------------------------- | --------------------- |
| **MachOView**    | Visual Mach-O analysis     | macOS App             |
| **otool**        | CLI inspection             | Built into Xcode      |
| **nm**           | Symbol listing             | Built into Xcode      |
| **optool**       | Inject load commands       | `brew install optool` |
| **insert_dylib** | Inject dylib easily        | GitHub                |
| **LIEF**         | Python binary manipulation | `pip install lief`    |
| **jtool2**       | Advanced Mach-O tool       | jonathanlevin.co.il   |
| **ldid**         | Sign/resign binaries       | `brew install ldid`   |
| **zsign**        | Fast iOS signing           | GitHub                |

---

## 3. Dylib Injection Methods

### Method A: optool (Recommended)

```bash
# Add LC_LOAD_DYLIB command to binary
optool install -c load -p "@executable_path/Tweak.dylib" -t Payload/App.app/AppBinary

# Verify injection
otool -L Payload/App.app/AppBinary | grep Tweak
```

### Method B: insert_dylib

```bash
# Download from GitHub
./insert_dylib --strip-codesig --all-yes \
    "@executable_path/Tweak.dylib" \
    Payload/App.app/AppBinary \
    Payload/App.app/AppBinary
```

### Method C: LIEF (Python - Most Flexible)

```python
import lief

# Load binary
binary = lief.parse("AppBinary")

# Add dylib
binary.add_library("@executable_path/Tweak.dylib")

# Save modified binary
binary.write("AppBinary_patched")
```

---

## 4. FAT/Universal Binary Handling

Modern iOS apps contain multiple architectures:

```bash
# Check architectures
lipo -info AppBinary
# Output: Architectures in the fat file: arm64 arm64e

# Extract single architecture
lipo AppBinary -thin arm64 -output AppBinary_arm64

# Patch the arm64 version...
# (Do your modifications here)

# Recombine if needed
lipo -create AppBinary_arm64 AppBinary_arm64e -output AppBinary_universal

# Or just use the arm64 version (works on most devices)
```

---

## 5. ARM64 Patching Reference

### Common Patches (Hex)

| Goal              | Original → Patched        | Hex Bytes                 |
| ----------------- | ------------------------- | ------------------------- |
| **Return TRUE**   | any → `mov w0, #1; ret`   | `20 00 80 52 C0 03 5F D6` |
| **Return FALSE**  | any → `mov w0, #0; ret`   | `00 00 80 52 C0 03 5F D6` |
| **Return 0.0f**   | any → `fmov s0, wzr; ret` | `00 00 27 1E C0 03 5F D6` |
| **NOP (4 bytes)** | any → `nop`               | `1F 20 03 D5`             |
| **Skip check**    | `b.ne` → `b` (always)     | Change condition bits     |

### Finding Patch Locations

```bash
# Search for string references
strings -o AppBinary | grep -i "license\|vip\|premium"

# Find function by string in Ghidra:
# 1. Search > For Strings > "isPremium"
# 2. Right-click > References > Find References
# 3. Go to referring function
# 4. Note the offset
```

---

## 6. Complete Sideloading Pipeline

```bash
#!/bin/bash
# sideload.sh - Complete IPA modification pipeline

APP_NAME="GameApp"
IPA_PATH="original.ipa"
DYLIB_PATH="Tweak.dylib"
SIGNING_ID="Apple Development: your@email.com"
PROV_PROFILE="embedded.mobileprovision"

# 1. Extract IPA
unzip -q "$IPA_PATH" -d temp

# 2. Find binary
BINARY="temp/Payload/$APP_NAME.app/$APP_NAME"

# 3. Remove old signature (required before modification)
codesign --remove-signature "$BINARY"

# 4. Copy dylib into app bundle
cp "$DYLIB_PATH" "temp/Payload/$APP_NAME.app/"

# 5. Inject dylib reference
optool install -c load -p "@executable_path/Tweak.dylib" -t "$BINARY"

# 6. Copy provisioning profile
cp "$PROV_PROFILE" "temp/Payload/$APP_NAME.app/embedded.mobileprovision"

# 7. Create entitlements from profile
security cms -D -i "$PROV_PROFILE" | plutil -extract Entitlements xml1 -o ents.plist -

# 8. Sign the dylib first
codesign -f -s "$SIGNING_ID" --entitlements ents.plist "temp/Payload/$APP_NAME.app/Tweak.dylib"

# 9. Sign all frameworks
find "temp/Payload/$APP_NAME.app/Frameworks" -name "*.dylib" -o -name "*.framework" | while read fw; do
    codesign -f -s "$SIGNING_ID" --entitlements ents.plist "$fw"
done

# 10. Sign the main binary
codesign -f -s "$SIGNING_ID" --entitlements ents.plist "$BINARY"

# 11. Sign the app bundle
codesign -f -s "$SIGNING_ID" --entitlements ents.plist "temp/Payload/$APP_NAME.app"

# 12. Repackage IPA
cd temp
zip -qr "../${APP_NAME}_modded.ipa" Payload
cd ..

# 13. Cleanup
rm -rf temp ents.plist

echo "✅ Created: ${APP_NAME}_modded.ipa"
```

---

## 7. Entitlements Template

Save as `ents.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Basic entitlements -->
    <key>application-identifier</key>
    <string>TEAMID.com.company.app</string>

    <key>get-task-allow</key>
    <true/>

    <!-- For debugging -->
    <key>com.apple.developer.team-identifier</key>
    <string>TEAMID</string>

    <!-- Skip library validation (required for dylib injection) -->
    <key>com.apple.private.skip-library-validation</key>
    <true/>

    <!-- Disable AMFI (if jailbroken) -->
    <key>com.apple.private.security.no-sandbox</key>
    <true/>

    <!-- Game Center (if app uses it) -->
    <key>com.apple.developer.game-center</key>
    <true/>
</dict>
</plist>
```

---

## 8. Signing Without Developer Account

### Using ldid (Jailbroken devices)

```bash
ldid -S ents.plist AppBinary
ldid -S ents.plist Tweak.dylib
```

### Using zsign (Faster alternative)

```bash
zsign -k privkey.pem -m provision.mobileprovision -o output.ipa input.ipa
```

### Ad-hoc Signing (Development only)

```bash
codesign -f -s - --entitlements ents.plist AppBinary
```

---

## 9. Troubleshooting

| Error                      | Cause                  | Solution                          |
| -------------------------- | ---------------------- | --------------------------------- |
| "killed: 9"                | Invalid signature      | Re-sign with correct entitlements |
| "dyld: Library not loaded" | Wrong dylib path       | Use `@executable_path/` prefix    |
| "Code signature invalid"   | Modified after signing | Sign binary last                  |
| App crashes on launch      | Missing dependencies   | Check `otool -L` for missing libs |
| "Unable to install"        | Provisioning issue     | Match bundle ID with profile      |

---

## 10. Advanced: Binary Patching with Python

```python
import lief
import struct

def patch_bytes(binary_path, offset, new_bytes):
    """Patch bytes at specific offset"""
    with open(binary_path, 'r+b') as f:
        f.seek(offset)
        f.write(new_bytes)

def make_return_true(binary_path, offset):
    """Patch function to return true"""
    # mov w0, #1; ret
    patch = bytes([0x20, 0x00, 0x80, 0x52, 0xC0, 0x03, 0x5F, 0xD6])
    patch_bytes(binary_path, offset, patch)

def nop_instruction(binary_path, offset, count=1):
    """NOP out instructions"""
    nop = bytes([0x1F, 0x20, 0x03, 0xD5])
    patch_bytes(binary_path, offset, nop * count)

# Example usage
binary = "GameBinary"
make_return_true(binary, 0x123456)  # Patch isLicensed
nop_instruction(binary, 0x789ABC, 4)  # NOP 4 instructions
```

---

> **Pro Tip:** Always backup the original binary before patching. Use version control (git) to track your patches.
