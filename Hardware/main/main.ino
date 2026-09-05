#include <Arduino.h>
#include <Wire.h>
#include <SPI.h>
#include <math.h>
#include <TFT_eSPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Keypad.h>
#include <ArduinoJson.h>

#include "qrcode.h"
#include "tinyml_model.h"

// ============================================================
// SENTINELVAULT MAIN ESP32
// HARDWARE-LOCK / PRESENTATION BUILD
//
// USB data cable: MAIN ESP32 ONLY
//
// CAM UART:
//   CAM GPIO13 TX -> MAIN GPIO16 RX
//   CAM GPIO14 RX <- MAIN GPIO17 TX
//   GND            -> GND
//
// OLED:
//   SDA -> GPIO21
//   SCL -> GPIO22
//   Address 0x3C
//
// TFT ILI9341:
//   SCK  -> GPIO18
//   MISO -> GPIO19
//   MOSI -> GPIO23
//   CS   -> GPIO32
//   DC   -> GPIO27
//   RST  -> GPIO33
//
// Keypad:
//   R1 -> GPIO4
//   R2 -> GPIO5
//   R3 -> GPIO13
//   R4 -> GPIO14
//   C1 -> GPIO25
//   C2 -> GPIO26
//   C3 -> GPIO12
//   C4 -> GPIO15
//
// Hardware interlock:
//   GPIO34
//
// Incoming QR is JSON and only these fields matter:
//   transactionId
//   ml.{8 TinyML features}
//   risk.{score, level, explanation}
//
// Everything else in the incoming JSON is ignored.
//
// Outgoing approval QR:
//   {"transactionId":"...","status":"signed_approved"}
// ============================================================

// ============================================================
// UART
// ============================================================
HardwareSerial CamUART(2);

#define CAM_RX 16
#define CAM_TX 17

static const size_t UART_PAYLOAD_MAX = 5000;
static const unsigned long UART_FRAME_TIMEOUT_MS = 3500;
static const unsigned long PING_INTERVAL_MS = 3000;
static const unsigned long CAM_TIMEOUT_MS = 9000;

// Separate control-line buffer and payload buffer.
// Control messages are short; JSON payload can be much longer.
String uartLineBuffer;
String uartPayloadBuffer;
bool uartReceivingPayload = false;
unsigned long uartPayloadStarted = 0;

// ============================================================
// Displays
// ============================================================
TFT_eSPI tft = TFT_eSPI();

Adafruit_SH1106G oled(
  128,
  64,
  &Wire,
  -1
);

// ============================================================
// GPIO / KEYPAD
// ============================================================
#define PRESENCE_PIN 34

const byte ROWS = 4;
const byte COLS = 4;

char keypadKeys[ROWS][COLS] = {
  { '1', '2', '3', 'A' },
  { '4', '5', '6', 'B' },
  { '7', '8', '9', 'C' },
  { '*', '0', '#', 'D' }
};

byte rowPins[ROWS] = {4, 5, 13, 14};
byte colPins[COLS] = {25, 26, 12, 15};

Keypad keypad = Keypad(
  makeKeymap(keypadKeys),
  rowPins,
  colPins,
  ROWS,
  COLS
);

// ============================================================
// DEVICE PIN
// ============================================================
const char *DEMO_PIN = "1234";

String enteredPIN;
bool deviceUnlocked = false;

// ============================================================
// PROTOCOL / UI
// ============================================================
static const size_t JSON_DOC_SIZE = 5000;
static const unsigned long UI_RESULT_DELAY_MS = 1600;
static const unsigned long SIGNING_DELAY_MS = 900;

enum SystemState {
  STATE_BOOT_PIN,
  STATE_WAITING,
  STATE_TRANSACTION,
  STATE_EXPLANATION,
  STATE_SIGNING,
  STATE_AUTH_QR
};

SystemState systemState = STATE_BOOT_PIN;

// ============================================================
// CAMERA / COMMUNICATION STATE
// ============================================================
bool camConnected = false;
unsigned long lastCamMessage = 0;
unsigned long lastPing = 0;

// Prevent the same exact QR from being immediately reprocessed.
String lastPayload;

// ============================================================
// TRANSACTION DATA
// ============================================================
struct TinyFeatures {
  float avg_min_sent = NAN;
  float avg_min_received = NAN;
  float time_diff = NAN;
  float sent_tnx = NAN;
  float received_tnx = NAN;
  float avg_value_received = NAN;
  float avg_value_sent = NAN;
  float total_transactions = NAN;
  bool present = false;
};

struct Transaction {
  String transactionId;

  float backendRiskScore = NAN;
  String backendRiskLevel;
  String explanation;

  TinyFeatures ml;

  float tinyProbability = 0.0f;
  bool tinyAnomalous = false;

  bool valid = false;
};

Transaction currentTxn;

// ============================================================
// LOGGING
// ============================================================
void mainLog(const String &msg) {
  Serial.println(msg);
}

void sendCamCommand(const String &msg) {
  CamUART.println(msg);
  Serial.print("[MAIN -> CAM] ");
  Serial.println(msg);
}

void logSection(const String &title) {
  Serial.println();
  Serial.println("============================================================");
  Serial.println(title);
  Serial.println("============================================================");
}

// ============================================================
// OLED HELPERS
// ============================================================
void oledClear() {
  oled.clearDisplay();
  oled.setTextColor(SH110X_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0, 0);
}

void oledText(
  const String &l1 = "",
  const String &l2 = "",
  const String &l3 = "",
  const String &l4 = ""
) {
  oledClear();

  if (l1.length()) oled.println(l1);
  if (l2.length()) oled.println(l2);
  if (l3.length()) oled.println(l3);
  if (l4.length()) oled.println(l4);

  oled.display();
}

// ============================================================
// TFT HELPERS
// ============================================================
void tftHeader(const String &title) {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(2);
  tft.setCursor(10, 8);
  tft.println(title);
  tft.drawLine(8, 35, 311, 35, TFT_WHITE);
}

void printWrappedTFT(
  const String &text,
  int x,
  int y,
  int maxChars,
  int lineHeight,
  int maxLines
) {
  if (text.length() == 0) return;

  String word;
  String line;
  int lines = 0;

  for (size_t i = 0; i <= text.length(); ++i) {
    char c = (i < text.length()) ? text[i] : ' ';

    if (c == ' ' || c == '\n') {
      if (word.length()) {
        if ((int)(line.length() + word.length() + 1) > maxChars) {
          if (lines < maxLines) {
            tft.setCursor(x, y + lines * lineHeight);
            tft.println(line);
            lines++;
          }
          line = word;
        } else {
          if (line.length()) line += ' ';
          line += word;
        }
        word = "";
      }

      if (c == '\n' && line.length()) {
        if (lines < maxLines) {
          tft.setCursor(x, y + lines * lineHeight);
          tft.println(line);
          lines++;
        }
        line = "";
      }
    } else {
      word += c;
    }
  }

  if (line.length() && lines < maxLines) {
    tft.setCursor(x, y + lines * lineHeight);
    tft.println(line);
  }
}

// ============================================================
// UI STATES
// ============================================================
void showBootPINScreen() {
  tftHeader("DEVICE UNLOCK");

  tft.setTextSize(2);
  tft.setCursor(18, 65);
  tft.println("Enter device PIN");

  tft.setTextSize(4);
  tft.setCursor(35, 105);

  String masked;
  for (size_t i = 0; i < enteredPIN.length(); ++i) {
    masked += '*';
  }
  tft.println(masked);

  tft.setTextSize(1);
  tft.setCursor(18, 170);
  tft.println("C = CLEAR    D = ENTER");
  tft.setCursor(18, 192);
  tft.println("PIN required to initialize device");

  oledText(
    "DEVICE LOCKED",
    "ENTER PIN",
    "C=CLR  D=ENTER"
  );
}

void showWaitingScreen() {
  tftHeader("SENTINELVAULT");

  tft.setTextSize(2);
  tft.setCursor(10, 55);
  tft.println(deviceUnlocked ? "DEVICE: UNLOCKED" : "DEVICE: LOCKED");

  tft.setCursor(10, 88);
  tft.println(camConnected ? "CAM: ONLINE" : "CAM: WAITING");

  tft.setTextSize(1);
  tft.setCursor(10, 125);
  tft.println("Browser jsQR -> CAM -> UART -> MAIN");
  tft.setCursor(10, 145);
  tft.println("Waiting for transaction QR");
  tft.setCursor(10, 175);
  tft.println("A = APPROVE       B = REJECT");
  tft.setCursor(10, 195);
  tft.println("GPIO34 interlock active");
  tft.setCursor(10, 215);
  tft.println("TinyML local anomaly check active");
  tft.setCursor(10, 230);
  tft.println("* = DEMO TXN     # = LOCK DEVICE");

  oledText(
    "SENTINELVAULT",
    deviceUnlocked ? "DEVICE UNLOCKED" : "DEVICE LOCKED",
    camConnected ? "CAM ONLINE" : "CAM WAITING",
    "SCAN TRANSACTION"
  );
}

void printWrappedOLED(
  const String &text,
  int maxChars,
  int maxLines
) {
  if (text.length() == 0) return;

  String word;
  String line;
  int lines = 0;

  for (size_t i = 0; i <= text.length(); ++i) {
    char c = (i < text.length()) ? text[i] : ' ';

    if (c == ' ' || c == '\n') {
      if (word.length()) {
        if ((int)(line.length() + word.length() + 1) > maxChars) {
          if (lines < maxLines) {
            oled.println(line);
            lines++;
          }
          line = word;
        } else {
          if (line.length()) line += ' ';
          line += word;
        }
        word = "";
      }

      if (c == '\n' && line.length()) {
        if (lines < maxLines) {
          oled.println(line);
          lines++;
        }
        line = "";
      }
    } else {
      word += c;
    }
  }

  if (line.length() && lines < maxLines) {
    oled.println(line);
  }
}

void showTransactionScreen() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);

  tft.setTextSize(2);
  tft.setCursor(8, 5);
  tft.println("TRANSACTION");
  tft.drawLine(8, 30, 311, 30, TFT_WHITE);

  tft.setTextSize(1);
  tft.setCursor(8, 42);
  tft.println("TRANSACTION ID:");

  tft.setTextSize(2);
  tft.setCursor(8, 58);
  tft.println(currentTxn.transactionId);

  tft.setTextSize(1);
  tft.setCursor(8, 92);
  tft.println("ONLINE ML:");

  tft.setTextSize(2);
  tft.setCursor(8, 108);
  tft.printf(
    "%s  %.2f",
    currentTxn.backendRiskLevel.c_str(),
    currentTxn.backendRiskScore
  );

  tft.setTextSize(1);
  tft.setCursor(8, 142);
  tft.println("DEVICE TINYML:");

  tft.setTextSize(2);
  tft.setCursor(8, 158);
  tft.printf(
    "%s  %.3f",
    currentTxn.tinyAnomalous ? "ANOMALOUS" : "NORMAL",
    currentTxn.tinyProbability
  );

  tft.setTextSize(1);
  tft.setCursor(8, 198);
  tft.println("C = EXPLANATION");

  tft.setCursor(8, 218);
  tft.println("A = APPROVE    B = REJECT    # = LOCK");

  // OLED: transaction details screen.
  oledClear();
  oled.println("TXN REVIEW");
  oled.println("ID:");
  oled.println(currentTxn.transactionId);
  oled.printf(
    "ONLINE:%s %.1f\n",
    currentTxn.backendRiskLevel.c_str(),
    currentTxn.backendRiskScore
  );
  oled.printf(
    "DEVICE:%s",
    currentTxn.tinyAnomalous ? "HIGH" : "OK"
  );
  oled.display();
}

void showExplanationScreen() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);

  tft.setTextSize(2);
  tft.setCursor(8, 5);
  tft.println("EXPLANATION");
  tft.drawLine(8, 30, 311, 30, TFT_WHITE);

  tft.setTextSize(2);

  printWrappedTFT(
    currentTxn.explanation,
    10,
    48,
    25,
    22,
    7
  );

  tft.setTextSize(1);
  tft.setCursor(8, 198);
  tft.println("C = DETAILS");

  tft.setCursor(8, 218);
  tft.println("A = APPROVE    B = REJECT    # = LOCK");

  // OLED reflects that the explanation screen is active.
  oledClear();
  oled.println("EXPLANATION:");
  printWrappedOLED(
    currentTxn.explanation,
    20,
    3
  );
  oled.println("C=DETAILS");
  oled.display();
}

void showRejectedScreen() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextSize(3);
  tft.setCursor(28, 65);
  tft.println("REJECTED");

  tft.setTextSize(1);
  tft.setCursor(55, 120);
  tft.println("Transaction cancelled");

  oledText(
    "TRANSACTION",
    "REJECTED",
    currentTxn.transactionId
  );
}

void showSigningScreen() {
  tftHeader("SIGNING");

  tft.setTextSize(2);
  tft.setCursor(15, 70);
  tft.println("Hardware OK");
  tft.setCursor(15, 105);
  tft.println("Signing...");

  oledText(
    "APPROVED",
    "HARDWARE LINE OK",
    "SIGNING"
  );
}

void showBlockedScreen() {
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);

  tft.setTextSize(3);
  tft.setCursor(18, 55);
  tft.println("BLOCKED");

  tft.setTextSize(2);
  tft.setCursor(18, 108);
  tft.println("LINE BROKEN");

  tft.setTextSize(1);
  tft.setCursor(18, 145);
  tft.println("Signing stopped by GPIO34 interlock");

  oledText(
    "SIGNING BLOCKED",
    "LINE BROKEN",
    "FAIL CLOSED"
  );
}

void showAuthorizationScreen() {
  tft.fillScreen(TFT_WHITE);
  tft.setTextColor(TFT_BLACK, TFT_WHITE);

  tft.setTextSize(2);
  tft.setCursor(7, 5);
  tft.println("APPROVED");

  tft.setTextSize(1);
  tft.setCursor(7, 27);
  tft.println("Authorization QR");

  oledText(
    "APPROVED",
    currentTxn.transactionId,
    "SCAN AUTH QR",
    "D = DONE"
  );
}

// ============================================================
// RESET
// ============================================================
void resetTransaction() {
  currentTxn = Transaction();
  uartReceivingPayload = false;
  uartPayloadBuffer = "";
  systemState = STATE_WAITING;
  showWaitingScreen();
}

// ============================================================
// TINYML
// ============================================================
bool runTinyML() {
  if (!currentTxn.ml.present) {
    mainLog("[TINYML] ERROR: 8-feature vector incomplete");
    return false;
  }

  float features[8] = {
    currentTxn.ml.avg_min_sent,
    currentTxn.ml.avg_min_received,
    currentTxn.ml.time_diff,
    currentTxn.ml.sent_tnx,
    currentTxn.ml.received_tnx,
    currentTxn.ml.avg_value_received,
    currentTxn.ml.avg_value_sent,
    currentTxn.ml.total_transactions
  };

  const char *names[8] = {
    "avg_min_sent",
    "avg_min_received",
    "time_diff",
    "sent_tnx",
    "received_tnx",
    "avg_value_received",
    "avg_value_sent",
    "total_transactions"
  };

  logSection("TINYML LOCAL ANOMALY CHECK");

  for (int i = 0; i < 8; ++i) {
    Serial.printf(
      "[TINYML] %-22s = %.6f\n",
      names[i],
      features[i]
    );
  }

  unsigned long start = millis();

  currentTxn.tinyProbability =
    SentinelTinyML::predict(features);

  unsigned long elapsed = millis() - start;

  currentTxn.tinyAnomalous =
    SentinelTinyML::isAnomalous(
      currentTxn.tinyProbability
    );

  Serial.printf(
    "[TINYML] probability = %.6f\n",
    currentTxn.tinyProbability
  );

  Serial.printf(
    "[TINYML] threshold   = %.6f\n",
    SentinelTinyML::ANOMALY_THRESHOLD
  );

  Serial.printf(
    "[TINYML] inference   = %lu ms\n",
    elapsed
  );

  Serial.printf(
    "[TINYML] result      = %s\n",
    currentTxn.tinyAnomalous
      ? "ANOMALOUS"
      : "NORMAL"
  );

  sendCamCommand(
    String("[MAIN] TINYML RESULT ") +
    (currentTxn.tinyAnomalous
      ? "ANOMALOUS"
      : "NORMAL")
  );

  sendCamCommand(
    String("[MAIN] TINYML SCORE ") +
    String(currentTxn.tinyProbability, 6)
  );

  return true;
}

// ============================================================
// JSON PARSER
//
// Only required fields:
//   transactionId
//   ml: all 8 values
//   risk.score
//   risk.level
//   risk.explanation
//
// Everything else is ignored.
// ============================================================
bool parseIncomingPayload(
  const String &payload
) {
  if (payload.length() == 0) {
    mainLog("[JSON] Empty payload");
    return false;
  }

  if (payload.length() >= UART_PAYLOAD_MAX) {
    mainLog("[JSON] Payload exceeds maximum");
    return false;
  }

  DynamicJsonDocument doc(JSON_DOC_SIZE);

  DeserializationError err =
    deserializeJson(doc, payload);

  if (err) {
    Serial.print("[JSON] Parse failed: ");
    Serial.println(err.c_str());
    return false;
  }

  currentTxn = Transaction();

  // -----------------------------
  // Transaction ID
  // -----------------------------
  const char *transactionId =
    doc["transactionId"] | "";

  if (strlen(transactionId) == 0) {
    mainLog("[JSON] Missing transactionId");
    return false;
  }

  currentTxn.transactionId =
    transactionId;

  // -----------------------------
  // TinyML features
  // -----------------------------
  JsonObject ml =
    doc["ml"].as<JsonObject>();

  if (ml.isNull()) {
    mainLog("[JSON] Missing ml object");
    return false;
  }

  currentTxn.ml.avg_min_sent =
    ml["avg_min_sent"] | NAN;

  currentTxn.ml.avg_min_received =
    ml["avg_min_received"] | NAN;

  currentTxn.ml.time_diff =
    ml["time_diff"] | NAN;

  currentTxn.ml.sent_tnx =
    ml["sent_tnx"] | NAN;

  currentTxn.ml.received_tnx =
    ml["received_tnx"] | NAN;

  currentTxn.ml.avg_value_received =
    ml["avg_value_received"] | NAN;

  currentTxn.ml.avg_value_sent =
    ml["avg_value_sent"] | NAN;

  currentTxn.ml.total_transactions =
    ml["total_transactions"] | NAN;

  currentTxn.ml.present =
    isfinite(currentTxn.ml.avg_min_sent) &&
    isfinite(currentTxn.ml.avg_min_received) &&
    isfinite(currentTxn.ml.time_diff) &&
    isfinite(currentTxn.ml.sent_tnx) &&
    isfinite(currentTxn.ml.received_tnx) &&
    isfinite(currentTxn.ml.avg_value_received) &&
    isfinite(currentTxn.ml.avg_value_sent) &&
    isfinite(currentTxn.ml.total_transactions);

  if (!currentTxn.ml.present) {
    mainLog(
      "[JSON] One or more TinyML values are missing/invalid"
    );
    return false;
  }

  // -----------------------------
  // Online ML result + explanation
  // -----------------------------
  JsonObject risk =
    doc["risk"].as<JsonObject>();

  if (risk.isNull()) {
    mainLog("[JSON] Missing risk object");
    return false;
  }

  currentTxn.backendRiskScore =
    risk["score"] | NAN;

  currentTxn.backendRiskLevel =
    risk["level"] | "";

  currentTxn.explanation =
    risk["explanation"] | "";

  if (!isfinite(currentTxn.backendRiskScore)) {
    mainLog("[JSON] Missing/invalid risk score");
    return false;
  }

  if (currentTxn.backendRiskLevel.length() == 0) {
    mainLog("[JSON] Missing risk level");
    return false;
  }

  if (currentTxn.explanation.length() == 0) {
    mainLog("[JSON] Missing risk explanation");
    return false;
  }

  currentTxn.valid = true;
  return true;
}

// ============================================================
// COMPLETE PAYLOAD HANDLER
// ============================================================
void handleCompletePayload(
  const String &payload
) {
  logSection("TRANSACTION RECEIVED FROM CAM");

  Serial.printf(
    "[RX] Payload length: %u bytes\n",
    (unsigned)payload.length()
  );

  Serial.println("[RX] JSON:");
  Serial.println(payload);

  if (!deviceUnlocked) {
    mainLog(
      "[AUTH] Device is locked - transaction rejected"
    );
    sendCamCommand(
      "[MAIN] DEVICE LOCKED - TRANSACTION REJECTED"
    );
    return;
  }

  if (systemState != STATE_WAITING) {
    mainLog(
      "[MAIN] Device busy - QR ignored"
    );
    sendCamCommand(
      "[MAIN] BUSY - TRANSACTION IGNORED"
    );
    return;
  }

  if (payload == lastPayload) {
    mainLog(
      "[MAIN] Duplicate QR ignored"
    );
    sendCamCommand(
      "[MAIN] DUPLICATE PAYLOAD IGNORED"
    );
    return;
  }

  if (!parseIncomingPayload(payload)) {
    mainLog(
      "[MAIN] INVALID TRANSACTION - FAIL CLOSED"
    );
    sendCamCommand(
      "[MAIN] INVALID TRANSACTION - REJECTED"
    );

    tftHeader("INVALID QR");
    tft.setTextSize(2);
    tft.setCursor(15, 75);
    tft.println("PAYLOAD REJECTED");

    oledText(
      "INVALID QR",
      "PAYLOAD",
      "REJECTED"
    );

    delay(UI_RESULT_DELAY_MS);
    showWaitingScreen();
    return;
  }

  lastPayload = payload;

  // -----------------------------
  // Log parsed data
  // -----------------------------
  Serial.println();
  Serial.println("[MAIN] Transaction accepted by parser");
  Serial.print("[MAIN] Transaction ID : ");
  Serial.println(currentTxn.transactionId);

  Serial.print("[MAIN] Online risk     : ");
  Serial.print(currentTxn.backendRiskLevel);
  Serial.print(" / ");
  Serial.println(currentTxn.backendRiskScore, 3);

  Serial.print("[MAIN] Explanation      : ");
  Serial.println(currentTxn.explanation);

  Serial.println("[MAIN] 8 TinyML features present");

  sendCamCommand("[MAIN] VALID TRANSACTION");

  // -----------------------------
  // Run local model
  // -----------------------------
  if (!runTinyML()) {
    mainLog(
      "[MAIN] TinyML inference failed - transaction rejected"
    );
    sendCamCommand(
      "[MAIN] TINYML FAILURE - TRANSACTION REJECTED"
    );
    return;
  }

  // -----------------------------
  // Compare online result with
  // local TinyML result.
  // -----------------------------
  String onlineLevel =
    currentTxn.backendRiskLevel;

  bool onlineHigh =
    onlineLevel.equalsIgnoreCase("high") ||
    onlineLevel.equalsIgnoreCase("critical") ||
    currentTxn.backendRiskScore >= 50.0f;

  bool deviceHigh =
    currentTxn.tinyAnomalous;

  Serial.printf(
    "[RISK] Online=%s | DeviceTinyML=%s\n",
    onlineHigh ? "HIGH" : "LOW/NORMAL",
    deviceHigh ? "HIGH" : "LOW/NORMAL"
  );

  if (onlineHigh != deviceHigh) {
    Serial.println(
      "[RISK] Assessments disagree"
    );
    sendCamCommand(
      "[MAIN] RISK CONFLICT"
    );
  } else {
    Serial.println(
      "[RISK] Assessments agree"
    );
    sendCamCommand(
      "[MAIN] RISK AGREEMENT"
    );
  }

  // -----------------------------
  // Display
  // -----------------------------
  systemState =
    STATE_TRANSACTION;

  showTransactionScreen();

  sendCamCommand(
    "[MAIN] DISPLAYING TRANSACTION"
  );
}

// ============================================================
// UART FRAME PROCESSING
//
// CAM sends:
//
//   [CAM] PAYLOAD_BEGIN
//   <JSON>
//   [CAM] PAYLOAD_END
//
// The JSON is never passed through the short command buffer.
// ============================================================
void processCamLine(
  const String &line
) {
  String msg = line;
  msg.trim();

  if (msg.length() == 0) {
    return;
  }

  lastCamMessage = millis();
  camConnected = true;

  if (msg == "[CAM] HEARTBEAT") {
    Serial.println(
      "[COMM] CAM heartbeat received"
    );
    return;
  }

  if (msg == "[CAM] PONG") {
    Serial.println(
      "[COMM] CAM responded to PING"
    );
    return;
  }

  if (msg == "[CAM] PAYLOAD_BEGIN") {
    if (uartReceivingPayload) {
      uartPayloadBuffer = "";
    }

    uartReceivingPayload = true;
    uartPayloadBuffer = "";
    uartPayloadStarted = millis();

    Serial.println(
      "[UART] Payload frame BEGIN"
    );

    return;
  }

  if (msg == "[CAM] PAYLOAD_END") {
    if (!uartReceivingPayload) {
      Serial.println(
        "[UART] Unexpected PAYLOAD_END"
      );
      return;
    }

    uartReceivingPayload = false;

    Serial.printf(
      "[UART] Payload frame END (%u bytes)\n",
      (unsigned)uartPayloadBuffer.length()
    );

    String completePayload =
      uartPayloadBuffer;

    uartPayloadBuffer = "";

    handleCompletePayload(
      completePayload
    );

    return;
  }

  // If currently inside payload frame,
  // preserve the JSON data exactly as lines.
  if (uartReceivingPayload) {
    if (
      uartPayloadBuffer.length() +
      msg.length() + 1 >=
      UART_PAYLOAD_MAX
    ) {
      uartReceivingPayload = false;
      uartPayloadBuffer = "";

      Serial.println(
        "[UART] Payload overflow - frame rejected"
      );

      return;
    }

    if (uartPayloadBuffer.length() > 0) {
      uartPayloadBuffer += '\n';
    }

    uartPayloadBuffer += msg;

    return;
  }

  // Normal CAM log
  Serial.print("[CAM LOG] ");
  Serial.println(msg);
}

void readCamUART() {
  while (CamUART.available()) {
    char c =
      (char)CamUART.read();

    if (c == '\n') {
      uartLineBuffer.trim();

      if (uartLineBuffer.length() > 0) {
        processCamLine(
          uartLineBuffer
        );
      }

      uartLineBuffer = "";
    }
    else if (c != '\r') {
      // Control/log lines are intentionally bounded.
      // Payload is captured only after PAYLOAD_BEGIN.
      if (uartLineBuffer.length() < 700) {
        uartLineBuffer += c;
      }
      else {
        uartLineBuffer = "";

        Serial.println(
          "[UART] Control/log line overflow - cleared"
        );
      }
    }
  }

  if (
    uartReceivingPayload &&
    millis() - uartPayloadStarted >
      UART_FRAME_TIMEOUT_MS
  ) {
    uartReceivingPayload = false;
    uartPayloadBuffer = "";

    Serial.println(
      "[UART] Payload frame timeout - discarded"
    );
  }
}

// ============================================================
// BOOT PIN
// ============================================================
void handleBootPINKey(char key) {
  if (key >= '0' && key <= '9') {
    if (enteredPIN.length() < 8) {
      enteredPIN += key;
    }

    Serial.printf(
      "[KEYPAD] PIN digit entered (%u digits)\n",
      (unsigned)enteredPIN.length()
    );

    showBootPINScreen();
    return;
  }

  if (key == 'C') {
    enteredPIN = "";

    Serial.println(
      "[AUTH] Device PIN cleared"
    );

    showBootPINScreen();
    return;
  }

  if (key == 'D') {
    Serial.println(
      "[AUTH] Device PIN submitted"
    );

    if (enteredPIN == DEMO_PIN) {
      deviceUnlocked = true;
      enteredPIN = "";
      systemState = STATE_WAITING;

      logSection("DEVICE INITIALIZED");
      Serial.println(
        "[AUTH] DEVICE UNLOCKED"
      );

      sendCamCommand(
        "[MAIN] DEVICE UNLOCKED"
      );

      oledText(
        "DEVICE UNLOCKED",
        "READY",
        "SCAN QR"
      );

      delay(900);

      showWaitingScreen();
    }
    else {
      Serial.println(
        "[AUTH] WRONG DEVICE PIN"
      );

      tft.fillScreen(TFT_BLACK);
      tft.setTextColor(TFT_WHITE, TFT_BLACK);
      tft.setTextSize(3);
      tft.setCursor(25, 70);
      tft.println("WRONG PIN");

      oledText(
        "WRONG PIN",
        "DEVICE LOCKED",
        "TRY AGAIN"
      );

      delay(1200);

      enteredPIN = "";
      showBootPINScreen();
    }
  }
}

// ============================================================
// DEVICE LOCK
// ============================================================
void lockDevice() {
  Serial.println("[AUTH] # = LOCK DEVICE");

  deviceUnlocked = false;
  enteredPIN = "";
  currentTxn = Transaction();

  uartReceivingPayload = false;
  uartPayloadBuffer = "";

  systemState = STATE_BOOT_PIN;

  sendCamCommand("[MAIN] DEVICE LOCKED");

  logSection("DEVICE LOCKED");
  Serial.println("[AUTH] PIN REQUIRED TO UNLOCK AGAIN");

  showBootPINScreen();
}

// ============================================================
// TRANSACTION ACTIONS
// ============================================================
void rejectTransaction() {
  Serial.println(
    "[USER] B = REJECT"
  );

  sendCamCommand(
    "[MAIN] TRANSACTION REJECTED"
  );

  showRejectedScreen();

  delay(UI_RESULT_DELAY_MS);

  resetTransaction();
}

void approveTransaction() {
  Serial.println(
    "[USER] A = APPROVE"
  );

  sendCamCommand(
    "[MAIN] TRANSACTION APPROVED"
  );

  // -----------------------------
  // Hardware interlock
  // -----------------------------
  logSection(
    "HARDWARE INTERLOCK CHECK"
  );

  int lineState =
    digitalRead(PRESENCE_PIN);

  Serial.print(
    "[SECURITY] GPIO34 = "
  );
  Serial.println(lineState);

  if (lineState == LOW) {
    Serial.println(
      "[SECURITY] HARDWARE LINE BROKEN -> BLOCK SIGNING"
    );

    sendCamCommand(
      "[MAIN] SIGNING BLOCKED - LINE BROKEN"
    );

    showBlockedScreen();

    delay(UI_RESULT_DELAY_MS);

    resetTransaction();

    return;
  }

  Serial.println(
    "[SECURITY] HARDWARE LINE LIVE -> CONTINUE"
  );

  sendCamCommand(
    "[MAIN] HARDWARE LINE LIVE"
  );

  performSigning();
}

// ============================================================
// SIGNING + AUTHORIZATION QR
// ============================================================
void performSigning() {
  systemState = STATE_SIGNING;

  logSection("SIGNING");

  showSigningScreen();

  sendCamCommand(
    "[MAIN] SIGNING"
  );

  delay(SIGNING_DELAY_MS);

  Serial.println(
    "[SIGNING] Transaction authorization generated"
  );

  sendCamCommand(
    "[MAIN] SIGNATURE GENERATED"
  );

  generateAuthorizationQR();
}

void generateAuthorizationQR() {

  DynamicJsonDocument doc(512);

  doc["transactionId"] = currentTxn.transactionId;
  doc["status"] = "signed_approved";

  String qrPayload;

  serializeJson(doc, qrPayload);


  Serial.println();
  Serial.println("==================================================");
  Serial.println("AUTHORIZATION QR PAYLOAD");
  Serial.println("==================================================");
  Serial.println(qrPayload);

  Serial.print("[QR] Payload length: ");
  Serial.println(qrPayload.length());


  // ==================================================
  // FIXED VERSION
  //
  // Version 6
  // 41 x 41 modules
  //
  // Enough capacity for our compact authorization JSON
  // ==================================================

  const uint8_t QR_VERSION = 6;

  uint16_t bufferSize =
    qrcode_getBufferSize(QR_VERSION);


  uint8_t *qrData =
    (uint8_t *)malloc(bufferSize);


  if (qrData == nullptr) {

    Serial.println(
      "[QR] ERROR: Memory allocation failed"
    );

    return;
  }


  QRCode qrcode;


  int8_t result =
    qrcode_initText(
      &qrcode,
      qrData,
      QR_VERSION,
      ECC_LOW,
      qrPayload.c_str()
    );


  if (result != 0) {

    Serial.print(
      "[QR] ERROR: QR initialization failed: "
    );

    Serial.println(result);

    free(qrData);

    return;
  }


  Serial.print(
    "[QR] Version: "
  );

  Serial.println(QR_VERSION);


  Serial.print(
    "[QR] Module size: "
  );

  Serial.println(qrcode.size);


  // ==================================================
  // DISPLAY
  // ==================================================

  systemState = STATE_AUTH_QR;


  // Your physical TFT appears colour inverted.
  //
  // Software BLACK becomes physical LIGHT
  // Software WHITE becomes physical DARK.
  //
  // Therefore we deliberately use these values
  // to get a scanner-friendly physical QR.

  tft.fillScreen(TFT_BLACK);

  tft.setTextColor(
    TFT_WHITE,
    TFT_BLACK
  );


  tft.setTextSize(2);

  tft.setCursor(10, 5);

  tft.println("APPROVED");


  tft.setTextSize(1);

  tft.setCursor(10, 28);

  tft.println("Authorization QR");


  // ==================================================
  // QR SIZE
  //
  // Version 6 = 41 x 41
  //
  // Add 4-module quiet zone:
  //
  // 41 + 4 + 4 = 49 modules
  // ==================================================

  const int QUIET_ZONE = 4;

  const int TOTAL_MODULES =
    41 + (QUIET_ZONE * 2);


  // Available display area

  const int DISPLAY_WIDTH = 320;

  const int QR_AREA_TOP = 42;

  const int QR_AREA_HEIGHT = 190;


  int scaleX =
    DISPLAY_WIDTH / TOTAL_MODULES;


  int scaleY =
    QR_AREA_HEIGHT / TOTAL_MODULES;


  int scale =
    min(scaleX, scaleY);


  if (scale < 1) {

    Serial.println(
      "[QR] ERROR: QR does not fit display"
    );

    free(qrData);

    return;
  }


  int totalPixels =
    TOTAL_MODULES * scale;


  int qrStartX =
    (DISPLAY_WIDTH - totalPixels) / 2;


  int qrStartY =
    QR_AREA_TOP +
    ((QR_AREA_HEIGHT - totalPixels) / 2);


  // ==================================================
  // QUIET ZONE BACKGROUND
  //
  // TFT_BLACK is physically light on your display.
  // ==================================================

  tft.fillRect(
    qrStartX,
    qrStartY,
    totalPixels,
    totalPixels,
    TFT_BLACK
  );


  // ==================================================
  // DRAW QR
  //
  // TFT_WHITE becomes physically dark.
  // ==================================================

  for (
    int y = 0;
    y < qrcode.size;
    y++
  ) {

    for (
      int x = 0;
      x < qrcode.size;
      x++
    ) {

      bool module =
        qrcode_getModule(
          &qrcode,
          x,
          y
        );


      if (module) {

        int drawX =
          qrStartX +
          ((x + QUIET_ZONE) * scale);


        int drawY =
          qrStartY +
          ((y + QUIET_ZONE) * scale);


        tft.fillRect(
          drawX,
          drawY,
          scale,
          scale,
          TFT_WHITE
        );

      }

    }

  }


  // ==================================================
  // OLED
  // ==================================================

  oledText(
    "APPROVED",
    currentTxn.transactionId,
    "SCAN AUTH QR",
    "D = DONE"
  );


  Serial.println(
    "[QR] Authorization QR displayed successfully"
  );


  Serial.print(
    "[QR] Scale: "
  );

  Serial.println(scale);


  Serial.print(
    "[QR] Final QR pixels: "
  );

  Serial.println(totalPixels);


  sendCamCommand(
    "[MAIN] AUTHORIZATION QR GENERATED"
  );


  sendCamCommand(
    "[MAIN] AUTHORIZATION QR DISPLAYED"
  );


  free(qrData);

}

// ============================================================
// DEMO TRANSACTION INJECTION
//
// Press '*' while the device is unlocked and waiting.
// This simulates a transaction arriving from the camera even when
// no QR is currently detected. The payload is intentionally
// hardcoded for presentation/demo use.
// ============================================================
void injectDemoTransaction() {
  if (!deviceUnlocked) {
    Serial.println("[DEMO] Device locked - demo transaction ignored");
    return;
  }

  if (systemState != STATE_WAITING) {
    Serial.println("[DEMO] Device busy - demo transaction ignored");
    return;
  }

  logSection("DEMO TRANSACTION INJECTED");
  Serial.println("[DEMO] * pressed - simulating CAM transaction");

  // Hardcoded presentation payload. All 8 TinyML features are present.
  const String demoPayload =
    "{"
      "\"transactionId\":\"SV-DEMO-7F3A-91C2\","
      "\"ml\":{"
        "\"avg_min_sent\":0.0,"
        "\"avg_min_received\":0.0,"
        "\"time_diff\":0.0,"
        "\"sent_tnx\":0.0,"
        "\"received_tnx\":1.0,"
        "\"avg_value_received\":0.0,"
        "\"avg_value_sent\":0.0,"
        "\"total_transactions\":1.0"
      "},"
      "\"risk\":{"
        "\"score\":79.512,"
        "\"level\":\"high\","
        "\"explanation\":\"New recipient and unusual transaction activity detected. Please review the transaction before approval.\""
      "}"
    "}";

  Serial.print("[DEMO] Hardcoded payload length: ");
  Serial.println(demoPayload.length());
  Serial.println("[DEMO] Payload:");
  Serial.println(demoPayload);

  // Allow '*' to be pressed repeatedly for the same hardcoded demo.
  // This only affects the injected demo path; real CAM duplicate
  // protection remains unchanged.
  lastPayload = "";

  handleCompletePayload(demoPayload);
}

// ============================================================
// KEYPAD
// ============================================================
void handleKeypad() {
  char key =
    keypad.getKey();

  if (key == NO_KEY) {
    return;
  }

  Serial.print(
    "[KEYPAD] Key: "
  );
  Serial.println(key);

  if (systemState == STATE_BOOT_PIN) {
    handleBootPINKey(key);
    return;
  }

  // Once unlocked, # immediately locks the device from any
  // active unlocked state. The next operation requires the PIN.
  if (key == '#' && deviceUnlocked) {
    lockDevice();
    return;
  }

  // Presentation/demo shortcut: inject a hardcoded transaction
  // without requiring a QR from the camera.
  if (key == '*' && deviceUnlocked && systemState == STATE_WAITING) {
    injectDemoTransaction();
    return;
  }

  if (systemState == STATE_TRANSACTION) {
    if (key == 'A') {
      approveTransaction();
    }
    else if (key == 'B') {
      rejectTransaction();
    }
    else if (key == 'C') {
      Serial.println("[UI] Showing transaction explanation");
      systemState = STATE_EXPLANATION;
      showExplanationScreen();
    }
    else {
      Serial.println(
        "[KEYPAD] Details: A=Approve B=Reject C=Explanation #=Lock"
      );
    }

    return;
  }

  if (systemState == STATE_EXPLANATION) {
    if (key == 'A') {
      approveTransaction();
    }
    else if (key == 'B') {
      rejectTransaction();
    }
    else if (key == 'C') {
      Serial.println("[UI] Returning to transaction details");
      systemState = STATE_TRANSACTION;
      showTransactionScreen();
    }
    else {
      Serial.println(
        "[KEYPAD] Explanation: A=Approve B=Reject C=Details #=Lock"
      );
    }

    return;
  }

  if (systemState == STATE_AUTH_QR) {
    if (key == 'D') {
      Serial.println(
        "[AUTH] Authorization QR complete"
      );

      sendCamCommand(
        "[MAIN] AUTH QR COMPLETE"
      );

      resetTransaction();
    }

    return;
  }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(800);

  Serial.println();
  Serial.println(
    "============================================================"
  );
  Serial.println(
    "              SENTINELVAULT MAIN ESP32"
  );
  Serial.println(
    "               HARDWARE LOCK BUILD"
  );
  Serial.println(
    "============================================================"
  );

  Serial.println(
    "[BOOT] USB console = MAIN ESP32"
  );

  Serial.println(
    "[BOOT] CAM logs forwarded over UART"
  );

  // -----------------------------
  // CAM UART
  // -----------------------------
  CamUART.begin(
    115200,
    SERIAL_8N1,
    CAM_RX,
    CAM_TX
  );

  Serial.println(
    "[UART] CAM UART initialized @115200"
  );

  // -----------------------------
  // I2C / OLED
  // -----------------------------
  Wire.begin(
    21,
    22
  );

  if (!oled.begin(0x3C, true)) {
    Serial.println(
      "[OLED] Initialization FAILED"
    );
  }
  else {
    Serial.println(
      "[OLED] Initialization OK"
    );
  }

  // -----------------------------
  // GPIO34
  // -----------------------------
  pinMode(
    PRESENCE_PIN,
    INPUT
  );

  Serial.println(
    "[GPIO34] Hardware interlock initialized"
  );

  // -----------------------------
  // TFT
  // -----------------------------
  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);

  Serial.println(
    "[TFT] Initialization OK"
  );

  // -----------------------------
  // Device starts locked
  // -----------------------------
  deviceUnlocked = false;
  enteredPIN = "";
  currentTxn = Transaction();
  systemState = STATE_BOOT_PIN;

  showBootPINScreen();

  sendCamCommand(
    "[MAIN] MAIN ESP32 ONLINE"
  );

  sendCamCommand(
    "[MAIN] DEVICE LOCKED - WAITING PIN"
  );

  lastPing = millis();
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  readCamUART();
  handleKeypad();

  // CAM heartbeat/ping
  if (
    millis() - lastPing >=
    PING_INTERVAL_MS
  ) {
    lastPing = millis();

    sendCamCommand(
      "[MAIN] PING"
    );
  }

  // CAM timeout
  if (
    camConnected &&
    millis() - lastCamMessage >
      CAM_TIMEOUT_MS
  ) {
    camConnected = false;

    Serial.println();
    Serial.println(
      "[COMM] !!! CAM COMMUNICATION LOST !!!"
    );

    if (
      systemState == STATE_WAITING
    ) {
      showWaitingScreen();
    }
    else {
      oledText(
        "CAM OFFLINE",
        "CHECK UART"
      );
    }
  }

  delay(3);
}
