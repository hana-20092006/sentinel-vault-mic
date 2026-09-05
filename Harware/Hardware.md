# SentinelVault — Hardware Setup README

## 1. Project Overview

SentinelVault is a two-board hardware transaction verification and approval prototype.

### System architecture

```text
Transaction QR
      │
      ▼
Browser-side jsQR decoder
      │
      ▼
ESP32-CAM web server
      │ UART @ 115200
      ▼
Main ESP32
 ┌────┼─────────────────────────────┐
 │    │                             │
 ▼    ▼                             ▼
TFT  OLED                      4×4 Keypad
 │
 ▼
Transaction review
 │
 ├── TinyML analysis using 8 features
 ├── Online ML risk result from payload
 └── Explanation display
      │
      ▼
Approve / Reject
      │
      ▼
GPIO34 hardware interlock check
      │
      ▼
Authorization QR on TFT
```

Only the **Main ESP32 needs to be connected to the computer by USB for normal demonstration use**. The ESP32-CAM can be powered separately.

---

# 2. Required Components

## Core boards

- 1 × ESP32 DevKit / ESP-WROOM-32
- 1 × AI Thinker ESP32-CAM

## Displays

- 1 × ILI9341 SPI TFT display
- 1 × 1.3-inch I2C OLED, SH1106-compatible

## Input

- 1 × 4×4 matrix keypad

## Other hardware

- Breadboards
- Jumper wires
- USB cable for Main ESP32
- Separate power source/cable for ESP32-CAM
- 2 × 4.7 kΩ resistors for the GPIO34 hardware interlock
- Optional removable jumper/wire for the GPIO34 live-line demonstration

## Software files

### Main ESP32 sketch folder

The Main ESP32 sketch must contain:

```text
SentinelVault_Main_Final_TwoScreen_DemoStar.ino
tinyml_model.h
qrcode.h
qrcode.c
```

Do not place `qrcode.c`, `qrcode.h`, or `tinyml_model.h` somewhere unrelated and expect Arduino to find them. Keep them inside the same sketch folder.

### ESP32-CAM

Use:

```text
SentinelVault_CAM_Final_UPDATED.ino
```

---

# 3. Main ESP32 Pinout

## Complete Main ESP32 wiring table

| Module | Module Pin | Main ESP32 Pin |
|---|---|---|
| ESP32-CAM UART | TX / GPIO13 | GPIO16 RX |
| ESP32-CAM UART | RX / GPIO14 | GPIO17 TX |
| ESP32-CAM UART | GND | GND |
| OLED | SDA | GPIO21 |
| OLED | SCL | GPIO22 |
| OLED | VCC | 3V3 |
| OLED | GND | GND |
| TFT ILI9341 | SCK | GPIO18 |
| TFT ILI9341 | MISO / SDO | GPIO19 |
| TFT ILI9341 | MOSI / SDI | GPIO23 |
| TFT ILI9341 | CS | GPIO32 |
| TFT ILI9341 | DC | GPIO27 |
| TFT ILI9341 | RST | GPIO33 |
| TFT ILI9341 | VCC | 3V3 |
| TFT ILI9341 | GND | GND |
| TFT ILI9341 | LED | 3V3 |
| Keypad | R1 | GPIO4 |
| Keypad | R2 | GPIO5 |
| Keypad | R3 | GPIO13 |
| Keypad | R4 | GPIO14 |
| Keypad | C1 | GPIO25 |
| Keypad | C2 | GPIO26 |
| Keypad | C3 | GPIO12 |
| Keypad | C4 | GPIO15 |
| Hardware interlock | Signal | GPIO34 |

---

# 4. ESP32-CAM Pinout

The project uses an **AI Thinker ESP32-CAM**.

## UART connection

```text
ESP32-CAM                     Main ESP32
------------------------------------------------
GPIO13 TX  -----------------> GPIO16 RX

GPIO14 RX  <----------------- GPIO17 TX

GND       ------------------- GND
```

### Critical rule

**The two boards must share GND.**

The UART connection previously failed when the ground connection was missing or incorrect.

## ESP32-CAM internal camera pins

Do not rewire these pins. They are defined for the AI Thinker ESP32-CAM board:

```text
PWDN   = GPIO32
RESET  = -1
XCLK   = GPIO0
SIOD   = GPIO26
SIOC   = GPIO27

Y9     = GPIO35
Y8     = GPIO34
Y7     = GPIO39
Y6     = GPIO36
Y5     = GPIO21
Y4     = GPIO19
Y3     = GPIO18
Y2     = GPIO5

VSYNC  = GPIO25
HREF   = GPIO23
PCLK   = GPIO22
```

The project UART intentionally uses:

```text
CAM GPIO13 = TX
CAM GPIO14 = RX
```

---

# 5. TFT ILI9341 Wiring

Use the following exact wiring:

```text
TFT VCC     → Main ESP32 3V3
TFT GND     → Main ESP32 GND

TFT SCK     → GPIO18
TFT SDI     → GPIO23
TFT SDO     → GPIO19

TFT CS      → GPIO32
TFT DC      → GPIO27
TFT RESET   → GPIO33

TFT LED     → 3V3
```

## Important

The TFT is used as a **display only**.

Do not add the touch controller back into the current firmware or wiring.

---

# 6. TFT_eSPI Configuration

The project uses the `TFT_eSPI` library.

The known working configuration is:

```cpp
#define ILI9341_2_DRIVER

#define TFT_MOSI 23
#define TFT_MISO 19
#define TFT_SCLK 18
#define TFT_CS   32
#define TFT_DC   27
#define TFT_RST  33
```

## Important

The working hardware previously used:

```cpp
ILI9341_2_DRIVER
```

Do not automatically replace it with:

```cpp
ILI9341_DRIVER
```

The `ILI9341_2_DRIVER` configuration was the one known to work with this hardware.

## Typical TFT_eSPI setup procedure

1. Install the `TFT_eSPI` library.
2. Locate the library's setup file.
3. Configure the driver and pins shown above.
4. Ensure another conflicting driver configuration is not enabled.
5. Compile the Main ESP32 firmware.

---

# 7. OLED Wiring

The OLED is a 1.3-inch SH1106-compatible display.

```text
OLED VCC  → Main ESP32 3V3
OLED GND  → Main ESP32 GND

OLED SDA  → GPIO21
OLED SCL  → GPIO22
```

## I2C address

The working firmware uses:

```text
0x3C
```

---

# 8. 4×4 Keypad Wiring

## Rows

```text
R1 → GPIO4
R2 → GPIO5
R3 → GPIO13
R4 → GPIO14
```

## Columns

```text
C1 → GPIO25
C2 → GPIO26
C3 → GPIO12
C4 → GPIO15
```

## Key layout

```text
1  2  3  A
4  5  6  B
7  8  9  C
*  0  #  D
```

The keypad was tested with all 16 keys.

---

# 9. GPIO34 Hardware Interlock

GPIO34 is used as a hardware line/interlock check before the approval/signing flow.

The firmware interprets:

```text
GPIO34 HIGH → LINE LIVE / hardware check passes

GPIO34 LOW  → LINE BROKEN / signing is blocked
```

## Current resistor arrangement

```text
3.3V
 │
 │
removable / live line
 │
GPIO34
 │
4.7kΩ
 │
4.7kΩ
 │
GND
```

The two resistors provide approximately:

```text
4.7kΩ + 4.7kΩ = 9.4kΩ
```

## Important

GPIO34 is input-only and does not have an internal pull-up or pull-down.

Therefore:

- Keep the external resistor network.
- Do not rely on `INPUT_PULLUP`.
- Do not leave GPIO34 floating.
- Do not directly connect GPIO34 to 3.3V without the intended hardware arrangement.

---

# 10. Power Connections

## Main ESP32

For programming and Serial Monitor:

```text
Computer USB
      │
      ▼
Main ESP32
```

The Main ESP32 is the primary USB/Serial console.

## ESP32-CAM

The ESP32-CAM may be powered separately.

```text
Separate USB / power source
          │
          ▼
      ESP32-CAM
```

## UART ground

Even when the boards have separate power sources:

```text
ESP32-CAM GND
      │
      └──────── Main ESP32 GND
```

This shared ground is mandatory for reliable UART communication.

---

# 11. Arduino IDE Setup

## Install Arduino IDE

Use Arduino IDE 2.x.

## Additional Boards Manager URLs

In Arduino IDE, open:

```text
File → Preferences → Additional Boards Manager URLs
```

The exact URLs used during this project setup were:

```text
https://arduino.esp8266.com/stable/package_esp8266com_index.json
https://dl.espressif.com/dl/package_esp32_index.json
https://espressif.github.io/arduino-esp32/package_esp32_index.json
```

These should be entered in the **Additional Boards Manager URLs** field, with each URL on a separate line.

## ESP32 board support

Open:

```text
Tools → Board → Boards Manager
```

Search for:

```text
esp32
```

Install the **ESP32 board package by Espressif Systems**.

Both boards used by SentinelVault are ESP32-family boards:

```text
Main ESP32      → ESP32 DevKit / ESP-WROOM-32
ESP32-CAM       → AI Thinker ESP32-CAM
```

# 12. Main ESP32 Arduino IDE Settings

## Board

Use:

```text
DOIT ESP32 DEVKIT V1
```

or the equivalent board profile matching the ESP32 DevKit / ESP-WROOM-32 being used.

## Port

Select the COM/serial port belonging to the Main ESP32.

## Serial Monitor

Use:

```text
Baud rate: 115200
Line ending: New Line or No line ending
```

The Main firmware starts:

```cpp
Serial.begin(115200);
```

## Recommended upload setting

If no special board-specific setting is required:

```text
Upload Speed: 115200
```

Other board settings may remain at the board defaults unless the specific hardware requires otherwise.

---

# 13. ESP32-CAM Arduino IDE Settings

## Board

Select:

```text
AI Thinker ESP32-CAM
```

## Serial Monitor

Use:

```text
115200 baud
```

The camera firmware starts:

```cpp
Serial.begin(115200);
```

## Upload

If programming the ESP32-CAM directly with an external USB-to-serial adapter:

1. Connect the USB-to-serial adapter correctly.
2. Put the ESP32-CAM into flashing mode according to the AI Thinker board's normal upload procedure.
3. Upload the firmware.
4. Remove flashing mode / restore normal boot configuration.
5. Reset the board.

The exact USB-to-serial wiring is not part of the current runtime hardware wiring.

---

# 14. Required Arduino Libraries

## Main ESP32

Install:

```text
TFT_eSPI
Adafruit GFX Library
Adafruit SH110X
Keypad
ArduinoJson
```

The Main code also includes:

```cpp
#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <math.h>
```

These are provided by the Arduino/ESP32 environment.

## Local Main sketch files

Do not forget:

```text
tinyml_model.h
qrcode.h
qrcode.c
```

The QR implementation used by this project is the local Richard Moore `QRCode` implementation.

Do not replace it with a different QR API without changing the firmware.

## ESP32-CAM

The camera firmware uses:

```cpp
#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
```

These are supplied by the ESP32 Arduino environment.

---

# 15. Wi-Fi Configuration for ESP32-CAM

The ESP32-CAM firmware connects to Wi-Fi.

Before uploading, check:

```cpp
const char *ssid = "...";
const char *password = "...";
```

Set these to the Wi-Fi network available during the presentation.

## Important

The browser QR decoder uses:

```text
jsQR
```

loaded from a CDN in the browser page.

Therefore, for the current implementation, the browser needs access to the jsQR script when the page is first loaded.

The ESP32-CAM also needs to connect to the configured Wi-Fi network so the presentation browser can reach the camera's web server.

---

# 16. Serial and UART Settings

## USB Serial

Only the Main ESP32 needs to be connected to the presentation computer.

```text
Main ESP32 Serial Monitor
Baud: 115200
```

The Main ESP32 receives and prints forwarded camera logs.

## Inter-board UART

```text
Baud: 115200
Format: SERIAL_8N1
```

Main ESP32:

```text
RX = GPIO16
TX = GPIO17
```

ESP32-CAM:

```text
RX = GPIO14
TX = GPIO13
```

The connection is crossed:

```text
CAM TX → MAIN RX
CAM RX ← MAIN TX
```

---

# 17. Main ESP32 Runtime Controls

## Device unlock

At startup, the device is locked.

Enter the configured device PIN.

Current firmware PIN:

```text
1234
```

## Once unlocked

The device remains unlocked and can process multiple transactions.

A PIN is not required again after every transaction.

## Lock device

Press:

```text
#
```

The device locks and returns to the PIN screen.

## Transaction actions

```text
A → APPROVE
B → REJECT
C → Switch between transaction details and explanation
# → LOCK DEVICE
```

## Demo transaction

When waiting for a transaction, press:

```text
*
```

This injects the hardcoded demonstration transaction.

It follows the same Main ESP32 processing path as a transaction received from the camera:

```text
* pressed
    ↓
Hardcoded transaction
    ↓
JSON parsing
    ↓
TinyML inference
    ↓
Risk display
    ↓
Explanation
    ↓
Approve / Reject
```

---

# 18. Two-Screen Transaction Display

## Screen 1 — Transaction Details

Displays:

- Transaction ID
- Online ML risk level
- Online ML score
- Device TinyML result
- Device TinyML score
- Available actions

The explanation is intentionally not displayed here.

## Screen 2 — Explanation

Displays:

- The explanation received in the incoming transaction payload
- Wrapped text
- Navigation/action controls

Press:

```text
C
```

to switch between the details and explanation screens.

---

# 19. Incoming Transaction Payload

The Main ESP32 only requires the following information:

```text
transactionId

8 TinyML features:
- avg_min_sent
- avg_min_received
- time_diff
- sent_tnx
- received_tnx
- avg_value_received
- avg_value_sent
- total_transactions

Online risk:
- score
- level
- explanation
```

The expected structure is:

```json
{
  "transactionId": "SV-EXAMPLE-001",
  "ml": {
    "avg_min_sent": 0,
    "avg_min_received": 0,
    "time_diff": 0,
    "sent_tnx": 0,
    "received_tnx": 1,
    "avg_value_received": 0,
    "avg_value_sent": 0,
    "total_transactions": 1
  },
  "risk": {
    "score": 79.512,
    "level": "high",
    "explanation": "Example explanation from the online ML system."
  }
}
```

Other fields may exist in the QR payload, but the Main firmware ignores fields that are not required by the current pipeline.

---

# 20. Outgoing Authorization QR

After approval, the Main ESP32 generates an authorization QR containing:

```json
{
  "transactionId": "SV-EXAMPLE-001",
  "status": "signed_approved"
}
```

The QR is displayed on the TFT.

The current QR rendering uses the known working local QR implementation and a fixed QR generation flow suitable for the compact authorization payload.

---

# 21. ESP32-CAM Browser Workflow

After boot:

1. ESP32-CAM initializes the camera.
2. ESP32-CAM connects to Wi-Fi.
3. The camera logs its IP address.
4. Open the ESP32-CAM IP address in a browser.
5. The browser displays the live camera stream.
6. Browser-side jsQR scans the camera image.
7. Decoded QR text is POSTed back to the ESP32-CAM.
8. ESP32-CAM forwards the payload to the Main ESP32 over UART.
9. Main ESP32 processes the transaction.

The browser is intentionally responsible for QR decoding in the presentation build.

---

# 22. Expected Main Serial Monitor Logs

Typical boot logs:

```text
[BOOT] USB console = MAIN ESP32
[BOOT] CAM logs forwarded over UART
[UART] CAM UART initialized @115200
[OLED] Initialization OK
[GPIO34] Hardware interlock initialized
[TFT] Initialization OK
```

Typical camera communication:

```text
[CAM LOG] ...
[COMM] CAM heartbeat received
[MAIN -> CAM] [MAIN] PING
[COMM] CAM responded to PING
```

Typical transaction flow:

```text
[UART] PAYLOAD_BEGIN
[JSON] Parsing transaction
[TINYML] ...
[RISK] ...
```

The exact log wording can vary between firmware revisions.

---

# 23. Hardware Bring-Up Checklist

Follow this order.

## Step 1 — Main ESP32 only

Connect:

- Main ESP32
- OLED
- TFT
- Keypad
- GPIO34 interlock

Upload the Main firmware.

Verify:

```text
OLED works
TFT works
Keypad works
Serial Monitor works at 115200
```

## Step 2 — GPIO34

Verify:

```text
GPIO34 HIGH → hardware line passes
GPIO34 LOW  → hardware line blocks approval/signing
```

## Step 3 — ESP32-CAM

Power the ESP32-CAM.

Verify:

```text
Camera initialized
Wi-Fi connected
IP address printed
Live stream available
```

## Step 4 — UART

Connect:

```text
CAM GPIO13 → MAIN GPIO16
CAM GPIO14 ← MAIN GPIO17
GND → GND
```

Verify:

```text
CAM heartbeat reaches Main ESP32
Main PING reaches CAM
CAM responds to PING
```

## Step 5 — Browser QR

Open the ESP32-CAM browser interface.

Verify:

```text
Live stream visible
Browser reports scanner ready
Transaction QR is detected
Payload is forwarded
```

## Step 6 — Full pipeline

Verify:

```text
PIN unlock
      ↓
Camera transaction
      ↓
Main parses payload
      ↓
TinyML runs
      ↓
Transaction details screen
      ↓
Explanation screen
      ↓
Approve / Reject
      ↓
GPIO34 check
      ↓
Authorization QR
```

---

# 24. Important Do-Not-Change Notes

## Do not change UART pins

Keep:

```text
CAM GPIO13 TX → Main GPIO16 RX
CAM GPIO14 RX ← Main GPIO17 TX
```

## Do not forget shared ground

Always keep:

```text
CAM GND ↔ Main GND
```

## Do not reintroduce touch

The TFT is currently:

```text
DISPLAY ONLY
```

## Do not change the OLED I2C pins

```text
SDA = GPIO21
SCL = GPIO22
```

## Do not move keypad pins without updating firmware

Especially:

```text
GPIO12
```

is already used and tested with the current keypad setup.

## Do not use a different QR library casually

The Main firmware expects the local:

```text
qrcode.h
qrcode.c
```

implementation.

## Do not remove the GPIO34 external resistor network

GPIO34 does not provide an internal pull resistor.

---

# 25. Final Pre-Presentation Checklist

Before the presentation:

```text
[ ] Main ESP32 firmware uploaded
[ ] ESP32-CAM firmware uploaded

[ ] tinyml_model.h in Main sketch folder
[ ] qrcode.h in Main sketch folder
[ ] qrcode.c in Main sketch folder

[ ] TFT_eSPI configured with ILI9341_2_DRIVER
[ ] TFT pins match the hardware

[ ] OLED working at 0x3C

[ ] All keypad keys working

[ ] GPIO34 interlock tested

[ ] CAM and Main share GND

[ ] UART heartbeat working

[ ] ESP32-CAM connected to presentation Wi-Fi

[ ] Browser live stream opens

[ ] Browser-side QR detection works

[ ] Main Serial Monitor set to 115200

[ ] PIN unlock tested

[ ] Multiple transactions work without re-entering PIN

[ ] # locks the device

[ ] * demo transaction works

[ ] A approves

[ ] B rejects

[ ] C switches details/explanation

[ ] Authorization QR is scannable
```

---

# 26. Final Firmware Files

Recommended presentation set:

```text
Main ESP32:
SentinelVault_Main_Final_TwoScreen_DemoStar.ino

ESP32-CAM:
SentinelVault_CAM_Final_UPDATED.ino

Main local support files:
tinyml_model.h
qrcode.h
qrcode.c
```

---

## Final Runtime Summary

```text
POWER ON
   ↓
PIN: 1234
   ↓
DEVICE UNLOCKED
   ↓
WAIT FOR CAMERA QR
   │
   ├── OR press * for demo transaction
   │
   ▼
TRANSACTION DETAILS
   │
   ├── C → EXPLANATION
   ├── A → APPROVE
   ├── B → REJECT
   └── # → LOCK
        │
        ▼
GPIO34 HARDWARE CHECK
        │
        ▼
AUTHORIZATION QR
        │
        ▼
RETURN TO WAITING STATE

DEVICE REMAINS UNLOCKED
UNTIL # IS PRESSED
```
