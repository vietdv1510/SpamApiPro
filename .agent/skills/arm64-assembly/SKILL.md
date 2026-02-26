---
name: ARM64 Assembly
description: ARM64 (AArch64) instruction set reference and encoding guide. Essential for iOS binary patching and reverse engineering.
---

# ARM64 Assembly Reference

> Complete reference for ARM64 instruction set, encoding, and best practices

## Register Overview

### General Purpose Registers

```
X0-X7    Arguments/Results (caller-saved)
X8       Indirect result location
X9-X15   Temporary registers (caller-saved)
X16-X17  Intra-procedure-call (IP0, IP1)
X18      Platform register (reserved)
X19-X28  Callee-saved (MUST preserve!)
X29      Frame Pointer (FP)
X30      Link Register (LR)
SP       Stack Pointer (must be 16-byte aligned)
PC       Program Counter (implicit)
```

### Register Naming

```
X0-X30   64-bit registers
W0-W30   32-bit (lower half of X registers)
```

---

## Common Instructions

### Data Movement

#### MOV - Move Register

```assembly
MOV X0, X1              // X0 = X1
MOV W0, W1              // W0 = W1 (32-bit)
```

**Encoding:** `AA0103E0` (MOV X0, X1)

#### MOVZ - Move with Zero

```assembly
MOVZ X1, #0x1234        // X1 = 0x0000000000001234
MOVZ X1, #0x5678, LSL#16 // X1 = 0x0000000056780000
```

**Encoding:** `D2A468A1` (MOVZ X1, #0x1234)

#### MOVK - Move with Keep

```assembly
MOVK X1, #0xABCD, LSL#16 // Keep other bits, set [31:16]
```

**Encoding:** `F2A579A1` (MOVK X1, #0xABCD, LSL#16)

---

### Stack Operations

#### STP - Store Pair

```assembly
STP X19, X20, [SP, #-16]!  // Pre-index: SP -= 16, store
STP X21, LR, [SP, #-16]!   // Save LR
```

**Encoding:** `A9BF53F3` (STP X19, X20, [SP, #-16]!)

#### LDP - Load Pair

```assembly
LDP X21, LR, [SP], #16     // Load, then SP += 16 (post-index)
LDP X19, X20, [SP], #16    // Restore
```

**Encoding:** `A8C157F5` (LDP X21, LR, [SP], #16)

**Stack Rules:**

- Always 16-byte aligned
- STP/LDP must balance
- Pre-index for push: `[SP, #-16]!`
- Post-index for pop: `[SP], #16`

---

### Branch Instructions

#### B - Unconditional Branch

```assembly
B label                    // PC = label
```

**Encoding:** `14000000 | (offset >> 2)`
**Range:** ±128 MB

#### BL - Branch with Link

```assembly
BL function                // LR = PC + 4, PC = function
```

**Encoding:** `94000000 | (offset >> 2)`
**Range:** ±128 MB

**Offset Calculation:**

```
offset_bytes = target_address - current_address
offset_instructions = offset_bytes / 4
encoded = offset_instructions & 0x3FFFFFF
```

#### BR - Branch to Register

```assembly
BR X4                      // PC = X4
```

**Encoding:** `D61F0080` (BR X4)

#### RET - Return

```assembly
RET                        // PC = LR
RET X30                    // PC = X30 (explicit)
```

**Encoding:** `D65F03C0` (RET)

---

### Conditional Branches

#### B.cond - Conditional Branch

```assembly
B.EQ label                 // Branch if equal (Z=1)
B.NE label                 // Branch if not equal (Z=0)
B.LT label                 // Branch if less than (N!=V)
B.GE label                 // Branch if greater/equal (N=V)
```

**Condition Codes:**
| Code | Meaning | Flags |
|------|---------|-------|
| EQ | Equal | Z=1 |
| NE | Not Equal | Z=0 |
| LT | Less Than | N!=V |
| GE | Greater/Equal | N=V |
| GT | Greater Than | Z=0 && N=V |
| LE | Less/Equal | Z=1 \|\| N!=V |

**Encoding:** `54000000 | (offset << 5) | cond`

#### CBZ/CBNZ - Compare and Branch

```assembly
CBZ X0, label              // Branch if X0 == 0
CBNZ X20, label            // Branch if X20 != 0
```

**Encoding:** `B4000000 | (offset << 5) | reg`

---

### Load/Store

#### LDR - Load Register

```assembly
LDR X0, [X1]               // X0 = *X1
LDR W2, [X3, #8]           // W2 = *(X3 + 8)
```

#### STR - Store Register

```assembly
STR X0, [X1]               // *X1 = X0
STR W2, [X3, #8]           // *(X3 + 8) = W2
```

---

### Arithmetic

#### ADD/SUB

```assembly
ADD X0, X1, X2             // X0 = X1 + X2
ADD X0, X1, #16            // X0 = X1 + 16
SUB X0, X1, #8             // X0 = X1 - 8
```

#### CMP - Compare

```assembly
CMP X0, X1                 // Set flags: X0 - X1
CMP W2, #10                // Set flags: W2 - 10
```

---

### Logical Operations

#### AND/ORR/EOR

```assembly
AND X0, X1, X2             // X0 = X1 & X2
ORR X0, X1, X2             // X0 = X1 | X2
EOR X0, X1, X2             // X0 = X1 ^ X2
```

---

## Encoding Patterns

### Instruction Format

```
31                                                    0
┌────────────────────────────────────────────────────┐
│  opcode  │  operands  │  shift  │  registers       │
└────────────────────────────────────────────────────┘
```

### Common Opcodes

| Instruction | Opcode (bits 31-21)      |
| ----------- | ------------------------ |
| MOV (reg)   | `10101010000`            |
| MOVZ        | `110100101`              |
| MOVK        | `111100101`              |
| STP         | `10101001`               |
| LDP         | `10101000`               |
| B           | `000101`                 |
| BL          | `100101`                 |
| BR          | `1101011000011111000000` |
| RET         | `1101011001011111000000` |

---

## Calling Convention (AAPCS64)

### Function Entry

```assembly
// Prologue
STP X29, X30, [SP, #-16]!  // Save FP, LR
MOV X29, SP                 // Set up frame pointer
STP X19, X20, [SP, #-16]!  // Save callee-saved
```

### Function Exit

```assembly
// Epilogue
LDP X19, X20, [SP], #16    // Restore callee-saved
LDP X29, X30, [SP], #16    // Restore FP, LR
RET                         // Return
```

### Argument Passing

```
X0-X7    First 8 arguments
Stack    Additional arguments (16-byte aligned)
X8       Struct return address (if needed)
```

### Return Values

```
X0       Primary return value
X1       Secondary (for 128-bit returns)
```

---

## Common Patterns

### Function Hook Wrapper

```assembly
// Save context
STP X19, X20, [SP, #-16]!
STP X21, LR, [SP, #-16]!
MOV X21, X0                // Backup args
MOV X19, X1

// Call original or custom logic
BL target_function

// Restore context
MOV X1, X19                // Restore args
MOV X0, X21
LDP X21, LR, [SP], #16
LDP X19, X20, [SP], #16
BR X4                       // Jump to real function
```

### Scan Loop

```assembly
MOVZ X20, #0               // counter = 0
loop:
  MOV X0, X20              // arg = counter
  BL _dyld_get_image_header
  CBZ X0, next             // if NULL, continue
  // ... check logic ...
next:
  ADD X20, X20, #1         // counter++
  CMP X20, #30             // counter < 30?
  B.LT loop                // continue loop
```

---

## Validation Checklist

### Before Encoding

- [ ] Verify register usage (caller vs callee-saved)
- [ ] Check stack alignment (16-byte)
- [ ] Validate branch range (±128MB)
- [ ] Ensure STP/LDP balance

### After Encoding

- [ ] Disassemble to verify
- [ ] Check byte count
- [ ] Validate offsets
- [ ] Test with minimal patch first

---

## Debugging Tips

### Disassemble Hex

```bash
# Using objdump
echo "E0 03 01 AA" | xxd -r -p > /tmp/test.bin
objdump -D -b binary -m aarch64 /tmp/test.bin

# Using online tools
# https://armconverter.com/
```

### Common Errors

| Error               | Cause                  | Fix                      |
| ------------------- | ---------------------- | ------------------------ |
| Invalid instruction | Wrong encoding         | Re-encode, verify opcode |
| Stack misalignment  | Odd number of STP/LDP  | Balance pairs            |
| Branch out of range | Target > ±128MB        | Use register branch (BR) |
| Register corruption | Not preserving X19-X28 | Add STP/LDP              |

---

## Quick Reference

### NOP

```assembly
NOP                        // No operation
```

**Encoding:** `1F2003D5`

### Useful Immediates

```assembly
MOVZ X0, #0                // X0 = 0
MOVZ X0, #1                // X0 = 1
MOVZ X0, #0xFFFF           // X0 = 65535
```

### Magic Numbers

```assembly
MOVZ W3, #0xFACF           // Mach-O magic (low)
MOVK W3, #0xFEED, LSL#16   // Mach-O magic (high)
// Result: W3 = 0xFEEDFACF
```

---

## Related Skills

- `ios-binary-patching` - Apply ARM64 in practice
- `crash-log-analysis` - Debug ARM64 crashes
- `frida-debugging` - Dynamic ARM64 analysis
