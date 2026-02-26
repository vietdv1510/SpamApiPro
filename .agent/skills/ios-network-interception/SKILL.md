---
name: ios-network-interception
description: Master network traffic analysis and SSL Pinning bypass for iOS applications.
allowed-tools: Read, Write, Edit, Bash, Frida
skills:
  - ios-anti-cheat-bypass
---

# 🌐 iOS Network Interception & API Hacking (2025-2026 Edition)

> Capture, analyze, and modify app traffic to control server-side logic.
> Sources: PortSwigger, OWASP Mobile, Charles Proxy Docs, Frida CodeShare

---

## 1. Proxy Setup Tools

| Tool              | Platform  | Best For                 | Price    |
| ----------------- | --------- | ------------------------ | -------- |
| **Charles Proxy** | macOS/Win | General HTTPS inspection | $50      |
| **Proxyman**      | macOS     | Modern UI, fast          | $50      |
| **Burp Suite**    | All       | Professional pentesting  | Free/Pro |
| **mitmproxy**     | CLI       | Scripting, automation    | Free     |
| **HTTP Toolkit**  | All       | Easy setup               | Free/Pro |

---

## 2. iOS Proxy Configuration

### On Device (Settings > WiFi > Proxy)

```
Server: Your Mac's IP (e.g., 192.168.1.100)
Port: 8888 (Charles) or 9090 (Proxyman)
```

### Install Root Certificate (iOS 17/18)

1. Open `http://chls.pro/ssl` (Charles) or proxy's cert URL in Safari
2. Settings > General > VPN & Device Management > Install profile
3. Settings > General > About > Certificate Trust Settings > Enable full trust

> ⚠️ **iOS 18 Note:** Some cert operations require Supervised mode via Apple Configurator 2

---

## 3. SSL Pinning Bypass

### Method A: Tweak-based (Jailbreak)

```objc
// SSLBypass.x - Universal SSL Pinning Bypass
#import <Security/Security.h>

// iOS 15-18 compatible
%hookf(OSStatus, SecTrustEvaluateWithError, SecTrustRef trust, CFErrorRef *error) {
    if (error) *error = NULL;
    return errSecSuccess;
}

%hookf(OSStatus, SecTrustEvaluate, SecTrustRef trust, SecTrustResultType *result) {
    if (result) *result = kSecTrustResultProceed;
    return errSecSuccess;
}

// Network.framework (iOS 17+)
%hookf(void, nw_tls_create_peer_trust, void *a, bool b, void *c) {
    return; // Skip validation
}

// URLSession
%hook NSURLSessionConfiguration
- (void)setURLCredentialStorage:(NSURLCredentialStorage *)storage {
    %orig(nil);
}
%end

%hook NSURLSession
- (void)URLSession:(NSURLSession *)session
    didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge
    completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *))handler {
    handler(NSURLSessionAuthChallengeUseCredential,
            [NSURLCredential credentialForTrust:challenge.protectionSpace.serverTrust]);
}
%end

%ctor {
    %init;
}
```

### Method B: Frida Script (Non-Jailbreak)

```javascript
// ssl_bypass.js - Run with: frida -U -f com.app -l ssl_bypass.js
Java.perform
  ? null
  : (() => {
      // iOS SSL Bypass
      const resolver = new ApiResolver("objc");

      // Hook SecTrustEvaluateWithError
      try {
        const SecTrustEvaluateWithError = Module.findExportByName(
          "Security",
          "SecTrustEvaluateWithError",
        );
        Interceptor.attach(SecTrustEvaluateWithError, {
          onEnter: function (args) {
            this.errorPtr = args[1];
          },
          onLeave: function (retval) {
            if (this.errorPtr && !this.errorPtr.isNull()) {
              Memory.writePointer(this.errorPtr, ptr(0));
            }
            retval.replace(0); // errSecSuccess
          },
        });
        console.log("[+] Hooked SecTrustEvaluateWithError");
      } catch (e) {
        console.log("[-] SecTrustEvaluateWithError: " + e);
      }

      // Hook NSURLSession delegate
      resolver.enumerateMatches(
        "-[* URLSession:didReceiveChallenge:completionHandler:]",
        {
          onMatch: function (match) {
            Interceptor.attach(match.address, {
              onEnter: function (args) {
                const challenge = new ObjC.Object(args[3]);
                const completionHandler = new ObjC.Block(args[4]);
                const credential =
                  ObjC.classes.NSURLCredential.credentialForTrust_(
                    challenge.protectionSpace().serverTrust(),
                  );
                completionHandler.invoke(0, credential); // UseCredential
                this.bypass = true;
              },
              onLeave: function (retval) {
                if (this.bypass) {
                  // Prevent original handler
                }
              },
            });
          },
          onComplete: function () {},
        },
      );

      console.log("[+] SSL Pinning Bypass loaded!");
    })();
```

### Method C: Objection (Easiest)

```bash
# Install objection
pip3 install objection

# Bypass SSL pinning
objection -g "App Name" explore
# Inside objection:
ios sslpinning disable
```

---

## 4. License/IAP Hacking via Network

### Scenario: App checks license via API

**Original Request:**

```http
POST /api/v1/validate HTTP/1.1
Host: api.game.com

{"device_id": "ABC123", "license_key": "TRIAL"}
```

**Original Response:**

```json
{ "status": "expired", "features": [], "premium": false }
```

### Bypass with Charles Proxy:

1. **Map Local Response:**
   - Tools > Map Local
   - Match: `api.game.com/api/v1/validate`
   - Local Path: Create `fake_license.json`:

   ```json
   {
     "status": "active",
     "features": ["all"],
     "premium": true,
     "expiry": "2099-12-31"
   }
   ```

2. **Rewrite Response:**
   - Tools > Rewrite
   - Add rule for response body
   - Match: `"premium": false`
   - Replace: `"premium": true`

### Bypass with mitmproxy Script:

```python
# license_bypass.py
from mitmproxy import http
import json

def response(flow: http.HTTPFlow):
    if "api.game.com" in flow.request.host and "validate" in flow.request.path:
        # Modify response
        data = json.loads(flow.response.content)
        data["status"] = "active"
        data["premium"] = True
        data["expiry"] = "2099-12-31"
        flow.response.content = json.dumps(data).encode()

# Run: mitmproxy -s license_bypass.py
```

---

## 5. In-App Purchase Hacking

### Receipt Validation Interception

**Local Receipt (Offline Games):**

```objc
%hook SKPaymentTransactionObserver
- (void)paymentQueue:(SKPaymentQueue *)queue updatedTransactions:(NSArray *)transactions {
    for (SKPaymentTransaction *tx in transactions) {
        // Force all transactions to "purchased" state
        [tx setValue:@(SKPaymentTransactionStatePurchased) forKey:@"transactionState"];
    }
    %orig;
}
%end
```

**Server Receipt Validation:**
Intercept the receipt validation API and return success:

```python
# mitmproxy script
def response(flow):
    if "verifyReceipt" in flow.request.path:
        flow.response.content = b'{"status": 0, "receipt": {}}'  # 0 = valid
```

---

## 6. Protocol Buffer (Protobuf) Analysis

Many games use binary Protobuf instead of JSON:

### Decode Protobuf Traffic

```bash
# Install protobuf tools
pip install protobuf-inspector

# Decode raw protobuf
protobuf-inspector < captured_data.bin
```

### Find .proto Files

```bash
# Search in app bundle
find Payload -name "*.proto"

# Or extract from binary strings
strings AppBinary | grep -i "proto\|message\|field"
```

### Decode with Known Schema

```python
import schema_pb2  # Generated from .proto file

data = open("captured.bin", "rb").read()
msg = schema_pb2.GameMessage()
msg.ParseFromString(data)
print(msg)
```

---

## 7. WebSocket Interception

For real-time games with WebSocket:

### Capture with Charles:

Enable "WebSocket" in View menu

### Frida WebSocket Hook:

```javascript
// Hook WebSocket messages
const WebSocket = ObjC.classes.SRWebSocket;

Interceptor.attach(WebSocket["- send:"].implementation, {
  onEnter: function (args) {
    const data = new ObjC.Object(args[2]);
    console.log("[WS SEND] " + data.toString());
  },
});

Interceptor.attach(WebSocket["- webSocket:didReceiveMessage:"].implementation, {
  onEnter: function (args) {
    const msg = new ObjC.Object(args[3]);
    console.log("[WS RECV] " + msg.toString());
  },
});
```

---

## 8. Anti-Proxy Detection Bypass

Some apps detect proxy configuration:

```objc
// Bypass proxy detection
%hook NSURLSessionConfiguration
- (NSDictionary *)connectionProxyDictionary {
    return nil; // Hide proxy
}
%end

// Bypass Apple's "Secure Connection" check
%hook NSBundle
- (id)objectForInfoDictionaryKey:(NSString *)key {
    if ([key isEqualToString:@"NSAppTransportSecurity"]) {
        return @{@"NSAllowsArbitraryLoads": @YES};
    }
    return %orig;
}
%end
```

---

## 9. Request Replay & Automation

### Using mitmproxy for Automation

```python
# auto_rewards.py - Auto-claim daily rewards
from mitmproxy import http
import requests

def request(flow: http.HTTPFlow):
    if "claim_reward" in flow.request.path:
        # Modify reward amount
        flow.request.content = flow.request.content.replace(
            b'"amount": 1',
            b'"amount": 9999'
        )

def response(flow: http.HTTPFlow):
    # Log successful claims
    if "reward" in flow.request.path and b"success" in flow.response.content:
        print(f"[+] Reward claimed!")
```

---

## 10. Certificate Management

### Export Charles Certificate

```bash
# macOS Keychain
security find-certificate -a -p -c "Charles" > charles.pem

# Convert to DER format for iOS
openssl x509 -in charles.pem -outform der -out charles.cer
```

### Trust Certificate via MDM Profile

For iOS 18+ without jailbreak, create a .mobileconfig:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>PayloadCertificateFileName</key>
            <string>charles.cer</string>
            <key>PayloadContent</key>
            <data><!-- Base64 encoded certificate --></data>
            <key>PayloadType</key>
            <string>com.apple.security.root</string>
        </dict>
    </array>
    <key>PayloadType</key>
    <string>Configuration</string>
</dict>
</plist>
```

---

> **⚠️ Legal Warning:** Only intercept traffic from apps you own or have explicit permission to test. Unauthorized interception may violate computer fraud laws.
