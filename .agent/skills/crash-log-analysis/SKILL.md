---
name: Crash Log Analysis
description: Systematic iOS crash log analysis methodology. Parse, analyze, and identify root causes from .ips crash reports.
---

# Crash Log Analysis

> Systematic approach to parse and analyze iOS crash logs (.ips format)

## Core Principles

- **Systematic**: Follow checklist, don't jump to conclusions
- **Evidence-based**: Use actual data, not assumptions
- **Pattern recognition**: Compare with known crash signatures
- **Root cause focus**: Find the real issue, not just symptoms

---

## Crash Log Structure

### 1. Header Information

```json
{
  "incident": "UUID",
  "pid": 12345,
  "procName": "kgvn",
  "timestamp": "2026-01-20 00:35:00",
  "exception": {...},
  "termination": {...}
}
```

**Extract:**

- [ ] Process name
- [ ] PID
- [ ] Timestamp
- [ ] Exception type
- [ ] Termination reason

---

## Exception Types

### EXC_BAD_ACCESS

**Most common in binary patching!**

```json
"exception": {
  "type": "EXC_BAD_ACCESS",
  "signal": "SIGKILL",
  "subtype": "KERN_PROTECTION_FAILURE at 0x04f93624"
}
```

**Subtypes:**
| Subtype | Meaning | Common Cause |
|---------|---------|--------------|
| KERN_INVALID_ADDRESS | Invalid pointer | NULL dereference, bad offset |
| KERN_PROTECTION_FAILURE | Memory protection | Code signing, W^X violation |
| KERN_NO_ACCESS | Unmapped memory | Freed object, stack overflow |

**Analysis:**

- [ ] Check faulting address
- [ ] Verify address is in valid segment
- [ ] Check if code or data access
- [ ] Review memory protection flags

---

### EXC_BAD_INSTRUCTION

```json
"exception": {
  "type": "EXC_BAD_INSTRUCTION",
  "signal": "SIGILL"
}
```

**Causes:**

- Invalid opcode (wrong encoding)
- Executing data as code
- Unsupported instruction

**Analysis:**

- [ ] Disassemble at crash PC
- [ ] Verify instruction encoding
- [ ] Check if patch corrupted code

---

### EXC_CRASH

```json
"exception": {
  "type": "EXC_CRASH",
  "signal": "SIGABRT"
}
```

**Causes:**

- Assertion failure
- Uncaught exception
- Abort() called

**Analysis:**

- [ ] Check call stack for abort/assert
- [ ] Review console logs
- [ ] Look for exception messages

---

## Termination Reasons

### Code Signing

```json
"termination": {
  "namespace": "CODESIGNING",
  "code": 2,
  "indicator": "Invalid Page"
}
```

**Meaning:** iOS detected modified code

**Common scenarios:**

- Patched code executed
- Modified dylib loaded
- Tampered binary

**Solutions:**

- Re-sign binary
- Use different patch location
- Disable code signing (jailbreak only)

---

### Watchdog

```json
"termination": {
  "namespace": "WATCHDOG",
  "code": 8,
  "indicator": "Timeout"
}
```

**Meaning:** App took too long (main thread blocked)

**Common scenarios:**

- Infinite loop in patch
- Slow scan logic
- Deadlock

**Solutions:**

- Optimize patch logic
- Move work to background thread
- Reduce iteration count

---

## Thread State Analysis

### Register Values

```json
"threadState": {
  "x": [
    {"value": 13405714016},  // X0
    {"value": 0},            // X1
    {"value": 4418964873}    // X2
  ],
  "pc": {"value": 83441188},
  "lr": {"value": 4418226276},
  "sp": {"value": 6131474112},
  "fp": {"value": 6131474304}
}
```

### Validation Checklist

#### Program Counter (PC)

- [ ] Is PC in valid code segment?
- [ ] Is PC at expected instruction?
- [ ] Is PC in patched region?

#### Link Register (LR)

- [ ] Does LR point to valid return address?
- [ ] Is LR in expected caller?
- [ ] Was LR preserved correctly?

#### Stack Pointer (SP)

- [ ] Is SP 16-byte aligned?
- [ ] Is SP in valid stack range?
- [ ] Did stack overflow/underflow?

#### Arguments (X0-X7)

- [ ] Do values match expected types?
- [ ] Are pointers valid?
- [ ] Are values in reasonable range?

#### Callee-Saved (X19-X28)

- [ ] Were these preserved?
- [ ] Do values make sense?
- [ ] Compare with expected state

---

## Call Stack Analysis

### Example Stack

```json
"frames": [
  {"imageOffset": 83441188, "imageIndex": 24},  // Crash here
  {"imageOffset": 36450736, "imageIndex": 1},   // Caller
  {"symbol": "-[MTKView draw]", "imageIndex": 25}
]
```

### Analysis Steps

1. **Identify Crash Frame**
   - [ ] Note imageIndex and offset
   - [ ] Find in usedImages array
   - [ ] Calculate absolute address

2. **Trace Call Path**
   - [ ] Work backwards through stack
   - [ ] Identify entry point
   - [ ] Find where patch was called

3. **Verify Expected Flow**
   - [ ] Does stack match expected?
   - [ ] Are all frames valid?
   - [ ] Any unexpected functions?

---

## Memory Region Analysis

### vmRegionInfo

```
"vmRegionInfo": "0x4f93624 is not in any region.
  Bytes before following region: 4251961820
  REGION TYPE                 START - END      [ VSIZE]
  UNUSED SPACE AT START
  __TEXT                   102690000-102698000 [   32K]"
```

**Interpretation:**

- Faulting address NOT in any region → Invalid pointer
- "UNUSED SPACE" → Accessing unmapped memory
- Distance to next region → How far off target

**Analysis:**

- [ ] Is address in \_\_TEXT (code)?
- [ ] Is address in \_\_DATA (data)?
- [ ] Is address completely invalid?
- [ ] Calculate offset from expected address

---

## Root Cause Identification

### Decision Tree

```
Crash Type?
├─ EXC_BAD_ACCESS
│  ├─ KERN_PROTECTION_FAILURE
│  │  ├─ PC in patched code? → Code signing issue
│  │  └─ PC in original code? → Memory corruption
│  └─ KERN_INVALID_ADDRESS
│     ├─ Faulting address = 0? → NULL dereference
│     ├─ Small offset? → Wrong struct offset
│     └─ Large offset? → Corrupted pointer
├─ EXC_BAD_INSTRUCTION
│  └─ PC in patched code? → Wrong encoding
└─ EXC_CRASH
   └─ Check termination reason
```

### Common Patterns

#### Pattern 1: Code Signing

```
Exception: EXC_BAD_ACCESS
Subtype: KERN_PROTECTION_FAILURE
Termination: CODESIGNING - Invalid Page
PC: In patched region
```

**Cause:** iOS detected modified code
**Fix:** Re-sign or use different approach

#### Pattern 2: Register Corruption

```
Exception: EXC_BAD_ACCESS
Subtype: KERN_INVALID_ADDRESS
Faulting Address: Garbage value
X19-X28: Not preserved
```

**Cause:** Callee-saved registers corrupted
**Fix:** Add STP/LDP to preserve registers

#### Pattern 3: Stack Misalignment

```
Exception: EXC_BAD_ACCESS
SP: Not 16-byte aligned
STP/LDP: Imbalanced
```

**Cause:** Stack corruption
**Fix:** Balance STP/LDP pairs

#### Pattern 4: Wrong Offset

```
Exception: EXC_BAD_ACCESS
Faulting Address: Base + wrong_offset
X1: Unexpected value
```

**Cause:** RVA offset incorrect
**Fix:** Verify offset with disassembly

---

## Comparison Analysis

### Compare Multiple Crashes

| Version | Exception  | Faulting Address | PC   | Pattern      |
| ------- | ---------- | ---------------- | ---- | ------------ |
| V15     | BAD_ACCESS | 0x04f93624       | Same | Code signing |
| V22     | BAD_ACCESS | 0x04f93624       | Same | Code signing |
| V23     | BAD_ACCESS | 0x04f93624       | Same | Code signing |

**Conclusion:** Same crash across versions → Systemic issue (code signing)

---

## Systematic Workflow

### Step 1: Initial Triage (2 min)

- [ ] Read exception type
- [ ] Check termination reason
- [ ] Note faulting address
- [ ] Identify crash frame

### Step 2: Context Gathering (5 min)

- [ ] Extract register values
- [ ] Review call stack
- [ ] Check memory regions
- [ ] Note timestamp/version

### Step 3: Pattern Matching (3 min)

- [ ] Compare with known patterns
- [ ] Check similar crashes
- [ ] Identify category

### Step 4: Root Cause Analysis (10 min)

- [ ] Follow decision tree
- [ ] Verify hypothesis
- [ ] Create test matrix
- [ ] Document findings

### Step 5: Solution Planning (5 min)

- [ ] Identify fix approach
- [ ] Create test plan
- [ ] Prioritize versions to test

---

## Tools & Commands

### Extract Crash Info

```bash
# Get exception type
jq '.exception.type' crash.ips

# Get faulting address
jq '.exception.codes' crash.ips

# Get PC
jq '.threads[0].threadState.pc.value' crash.ips

# Get registers
jq '.threads[0].threadState.x' crash.ips
```

### Compare Crashes

```bash
# Compare faulting addresses
diff <(jq '.exception.codes' v22.ips) <(jq '.exception.codes' v23.ips)

# Compare PC values
diff <(jq '.threads[0].threadState.pc' v22.ips) <(jq '.threads[0].threadState.pc' v23.ips)
```

---

## Documentation Template

```markdown
## Crash Analysis: [Version]

**Date:** [Timestamp]
**Version:** [V22/V23/etc]

### Exception

- Type: [EXC_BAD_ACCESS/etc]
- Subtype: [KERN_PROTECTION_FAILURE/etc]
- Faulting Address: [0x...]
- Termination: [CODESIGNING/etc]

### Thread State

- PC: [0x...]
- LR: [0x...]
- SP: [0x...] (aligned: Y/N)
- X0-X7: [values]
- X19-X28: [preserved: Y/N]

### Call Stack

1. [Frame 0]
2. [Frame 1]
   ...

### Root Cause

[Identified cause]

### Evidence

- [Supporting data]
- [Comparison with other crashes]

### Proposed Fix

[Solution approach]

### Test Plan

- [ ] Test scenario 1
- [ ] Test scenario 2
```

---

## When to Use This Skill

- Analyzing iOS crash logs (.ips files)
- Debugging binary patches
- Investigating app crashes
- Comparing crash patterns
- Root cause analysis
- Creating test matrices

---

## Related Skills

- `ios-binary-patching` - Context for crashes
- `arm64-assembly` - Understand register state
- `frida-debugging` - Dynamic analysis
- `systematic-debugging` - General debugging methodology
