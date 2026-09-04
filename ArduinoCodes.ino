sketch_sep4b.ino

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
  tft.println("# = LOCK DEVICE");

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

tinyml_model.h

#ifndef SENTINEL_VAULT_TINYML_MODEL_H
#define SENTINEL_VAULT_TINYML_MODEL_H

#include <math.h>

namespace SentinelTinyML {

constexpr int INPUT_SIZE = 8;
constexpr int HIDDEN1_SIZE = 8;
constexpr int HIDDEN2_SIZE = 4;

constexpr float ANOMALY_THRESHOLD = 0.5f;

// StandardScaler parameters

const float SCALER_MEAN[INPUT_SIZE] = {
5138.8801219512f, 7994.5698399390f, 219958.8675215955f, 115.9425813008f, 168.7634654472f, 109.6748759491f, 45.0201772264f, 289.0264227642f
};

const float SCALER_SCALE[INPUT_SIZE] = {
21286.1834598607f, 23151.0307485030f, 325362.3976355183f, 754.0155555990f, 968.3906625435f, 3221.3235411197f, 250.3300278120f, 1376.3592261187f
};

// Layer 1: 8 inputs -> 8 neurons

const float W1[INPUT_SIZE][HIDDEN1_SIZE] = {
    {-0.0400275715f, 0.4253082321f, -0.0274647739f, -0.7983131729f, 0.1874581575f, -0.3082486955f, 0.1859042329f, 0.4719109479f},
    {0.2675764608f, -0.4109501869f, -1.3883079701f, 0.2288268829f, -0.0053003372f, -0.7746812733f, -0.5302558154f, 0.0791139685f},
    {-0.7378297263f, 1.1006385351f, 0.2406403437f, -0.0425704770f, 1.4090384507f, -0.8020453204f, 0.1532715675f, -0.5455446379f},
    {0.4469995968f, -0.0888805477f, -0.4700450137f, 0.8696474563f, 1.9360852970f, -0.0876848805f, -0.1102708288f, -0.6788426334f},
    {-0.3002450581f, 1.5417895073f, 0.4978292319f, 0.8524687142f, -0.2420263196f, -0.3000392438f, 0.6671737423f, 0.9102356073f},
    {-0.7612763489f, 0.0277943496f, -1.9935372944f, -0.0896008942f, 0.4687098574f, -0.1642573372f, -6.2518440282f, 0.9342107113f},
    {0.4464352758f, -1.6757180547f, 1.3411459333f, 0.9508796409f, 0.4430766571f, 0.8799895859f, -0.8539713167f, 0.3044454844f},
    {-0.1708777874f, 0.3184100379f, -0.6318032507f, 0.4213222483f, 0.5582185466f, 0.0235429751f, 0.6058943309f, 0.7927990558f},

};

const float B1[HIDDEN1_SIZE] = {
-0.4918929858f, 0.6388598590f, -0.2888723476f, 0.4061613673f, 0.1378562086f, 0.5012398389f, 0.1302219171f, -0.9873873131f
};

// Layer 2: 8 neurons -> 4 neurons

const float W2[HIDDEN1_SIZE][HIDDEN2_SIZE] = {
    {-0.5843756540f, -0.2619350609f, 4.0077289335f, 0.5725657794f},
    {1.1460473961f, -0.1311333409f, 1.4729886634f, 0.7445179394f},
    {0.2377692933f, 0.3951751429f, -2.1553962730f, -1.0917612019f},
    {-0.0137146802f, -0.5162133609f, 0.4439261785f, 0.9124498048f},
    {0.4215462936f, 0.3023622104f, -2.0086505009f, 0.0582336998f},
    {0.0381871102f, -0.1900746737f, 0.7627272015f, 0.3302987043f},
    {-0.8134077111f, -0.2001357278f, -2.3281773921f, -1.7123808169f},
    {-1.2824330029f, 0.1480993396f, -0.9400837494f, -0.1691788184f},

};

const float B2[HIDDEN2_SIZE] = {
0.2750241472f, -0.1746556107f, -0.1581313554f, 0.1065185826f
};

// Layer 3: 4 neurons -> 1 output

const float W3[HIDDEN2_SIZE] = {
-0.9807442599f, -3.8176345411f, -6.9042157366f, -2.9843754442f
};

const float B3 = 1.2814745725f;

inline float relu(float x) {
    return x > 0.0f ? x : 0.0f;
}

inline float sigmoid(float x) {
    return 1.0f / (1.0f + expf(-x));
}

inline float predict(const float input[INPUT_SIZE]) {

    float scaled[INPUT_SIZE];

    for (int i = 0; i < INPUT_SIZE; i++) {
        scaled[i] =
            (input[i] - SCALER_MEAN[i])
            / SCALER_SCALE[i];
    }

    float hidden1[HIDDEN1_SIZE];

    for (int j = 0; j < HIDDEN1_SIZE; j++) {

        float sum = B1[j];

        for (int i = 0; i < INPUT_SIZE; i++) {
            sum += scaled[i] * W1[i][j];
        }

        hidden1[j] = relu(sum);
    }

    float hidden2[HIDDEN2_SIZE];

    for (int j = 0; j < HIDDEN2_SIZE; j++) {

        float sum = B2[j];

        for (int i = 0; i < HIDDEN1_SIZE; i++) {
            sum += hidden1[i] * W2[i][j];
        }

        hidden2[j] = relu(sum);
    }

    float output = B3;

    for (int i = 0; i < HIDDEN2_SIZE; i++) {
        output += hidden2[i] * W3[i];
    }

    return sigmoid(output);
}

inline bool isAnomalous(float probability) {
    return probability >= ANOMALY_THRESHOLD;
}

}  // namespace SentinelTinyML

#endif
qrcode.c

/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 Richard Moore
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 *  Special thanks to Nayuki (https://www.nayuki.io/) from which this library was
 *  heavily inspired and compared against.
 *
 *  See: https://github.com/nayuki/QR-Code-generator/tree/master/cpp
 */

#include "qrcode.h"

#include <stdlib.h>
#include <string.h>

#pragma mark - Error Correction Lookup tables

#if LOCK_VERSION == 0

static const uint16_t NUM_ERROR_CORRECTION_CODEWORDS[4][40] = {
    // 1,  2,  3,  4,  5,   6,   7,   8,   9,  10,  11,  12,  13,  14,  15,  16,  17,  18,  19,  20,  21,  22,  23,  24,   25,   26,   27,   28,   29,   30,   31,   32,   33,   34,   35,   36,   37,   38,   39,   40    Error correction level
    { 10, 16, 26, 36, 48,  64,  72,  88, 110, 130, 150, 176, 198, 216, 240, 280, 308, 338, 364, 416, 442, 476, 504, 560,  588,  644,  700,  728,  784,  812,  868,  924,  980, 1036, 1064, 1120, 1204, 1260, 1316, 1372},  // Medium
    {  7, 10, 15, 20, 26,  36,  40,  48,  60,  72,  80,  96, 104, 120, 132, 144, 168, 180, 196, 224, 224, 252, 270, 300,  312,  336,  360,  390,  420,  450,  480,  510,  540,  570,  570,  600,  630,  660,  720,  750},  // Low
    { 17, 28, 44, 64, 88, 112, 130, 156, 192, 224, 264, 308, 352, 384, 432, 480, 532, 588, 650, 700, 750, 816, 900, 960, 1050, 1110, 1200, 1260, 1350, 1440, 1530, 1620, 1710, 1800, 1890, 1980, 2100, 2220, 2310, 2430},  // High
    { 13, 22, 36, 52, 72,  96, 108, 132, 160, 192, 224, 260, 288, 320, 360, 408, 448, 504, 546, 600, 644, 690, 750, 810,  870,  952, 1020, 1050, 1140, 1200, 1290, 1350, 1440, 1530, 1590, 1680, 1770, 1860, 1950, 2040},  // Quartile
};

static const uint8_t NUM_ERROR_CORRECTION_BLOCKS[4][40] = {
    // Version: (note that index 0 is for padding, and is set to an illegal value)
    // 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
    {  1, 1, 1, 2, 2, 4, 4, 4, 5, 5,  5,  8,  9,  9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49},  // Medium
    {  1, 1, 1, 1, 1, 2, 2, 2, 2, 4,  4,  4,  4,  4,  6,  6,  6,  6,  7,  8,  8,  9,  9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25},  // Low
    {  1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81},  // High
    {  1, 1, 2, 2, 4, 4, 6, 6, 8, 8,  8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68},  // Quartile
};

static const uint16_t NUM_RAW_DATA_MODULES[40] = {
    //  1,   2,   3,   4,    5,    6,    7,    8,    9,   10,   11,   12,   13,   14,   15,   16,   17,
      208, 359, 567, 807, 1079, 1383, 1568, 1936, 2336, 2768, 3232, 3728, 4256, 4651, 5243, 5867, 6523,
    //   18,   19,   20,   21,    22,    23,    24,    25,   26,    27,     28,    29,    30,    31,
       7211, 7931, 8683, 9252, 10068, 10916, 11796, 12708, 13652, 14628, 15371, 16411, 17483, 18587,
    //    32,    33,    34,    35,    36,    37,    38,    39,    40
       19723, 20891, 22091, 23008, 24272, 25568, 26896, 28256, 29648
};

// @TODO: Put other LOCK_VERSIONS here
#elif LOCK_VERSION == 3

static const int16_t NUM_ERROR_CORRECTION_CODEWORDS[4] = {
    26, 15, 44, 36
};

static const int8_t NUM_ERROR_CORRECTION_BLOCKS[4] = {
    1, 1, 2, 2
};

static const uint16_t NUM_RAW_DATA_MODULES = 567;

#else

#error Unsupported LOCK_VERSION (add it...)

#endif

static int max(int a, int b) {
    if (a > b) { return a; }
    return b;
}

/*
static int abs(int value) {
    if (value < 0) { return -value; }
    return value;
}
*/

#pragma mark - Mode testing and conversion

static int8_t getAlphanumeric(char c) {
    
    if (c >= '0' && c <= '9') { return (c - '0'); }
    if (c >= 'A' && c <= 'Z') { return (c - 'A' + 10); }
    
    switch (c) {
        case ' ': return 36;
        case '$': return 37;
        case '%': return 38;
        case '*': return 39;
        case '+': return 40;
        case '-': return 41;
        case '.': return 42;
        case '/': return 43;
        case ':': return 44;
    }
    
    return -1;
}

static bool isAlphanumeric(const char *text, uint16_t length) {
    while (length != 0) {
        if (getAlphanumeric(text[--length]) == -1) { return false; }
    }
    return true;
}

static bool isNumeric(const char *text, uint16_t length) {
    while (length != 0) {
        char c = text[--length];
        if (c < '0' || c > '9') { return false; }
    }
    return true;
}

#pragma mark - Counting

// We store the following tightly packed (less 8) in modeInfo
//               <=9  <=26  <= 40
// NUMERIC      ( 10,   12,    14);
// ALPHANUMERIC (  9,   11,    13);
// BYTE         (  8,   16,    16);
static char getModeBits(uint8_t version, uint8_t mode) {
    // Note: We use 15 instead of 16; since 15 doesn't exist and we cannot store 16 (8 + 8) in 3 bits
    // hex(int("".join(reversed([('00' + bin(x - 8)[2:])[-3:] for x in [10, 9, 8, 12, 11, 15, 14, 13, 15]])), 2))
    unsigned int modeInfo = 0x7bbb80a;
    
#if LOCK_VERSION == 0 || LOCK_VERSION > 9
    if (version > 9) { modeInfo >>= 9; }
#endif
    
#if LOCK_VERSION == 0 || LOCK_VERSION > 26
    if (version > 26) { modeInfo >>= 9; }
#endif
    
    char result = 8 + ((modeInfo >> (3 * mode)) & 0x07);
    if (result == 15) { result = 16; }
    
    return result;
}

#pragma mark - BitBucket

typedef struct BitBucket {
    uint32_t bitOffsetOrWidth;
    uint16_t capacityBytes;
    uint8_t *data;
} BitBucket;

/*
void bb_dump(BitBucket *bitBuffer) {
    printf("Buffer: ");
    for (uint32_t i = 0; i < bitBuffer->capacityBytes; i++) {
        printf("%02x", bitBuffer->data[i]);
        if ((i % 4) == 3) { printf(" "); }
    }
    printf("\n");
}
*/

static uint16_t bb_getGridSizeBytes(uint8_t size) {
    return (((size * size) + 7) / 8);
}

static uint16_t bb_getBufferSizeBytes(uint32_t bits) {
    return ((bits + 7) / 8);
}

static void bb_initBuffer(BitBucket *bitBuffer, uint8_t *data, int32_t capacityBytes) {
    bitBuffer->bitOffsetOrWidth = 0;
    bitBuffer->capacityBytes = capacityBytes;
    bitBuffer->data = data;
    
    memset(data, 0, bitBuffer->capacityBytes);
}

static void bb_initGrid(BitBucket *bitGrid, uint8_t *data, uint8_t size) {
    bitGrid->bitOffsetOrWidth = size;
    bitGrid->capacityBytes = bb_getGridSizeBytes(size);
    bitGrid->data = data;

    memset(data, 0, bitGrid->capacityBytes);
}

static void bb_appendBits(BitBucket *bitBuffer, uint32_t val, uint8_t length) {
    uint32_t offset = bitBuffer->bitOffsetOrWidth;
    for (int8_t i = length - 1; i >= 0; i--, offset++) {
        bitBuffer->data[offset >> 3] |= ((val >> i) & 1) << (7 - (offset & 7));
    }
    bitBuffer->bitOffsetOrWidth = offset;
}
/*
void bb_setBits(BitBucket *bitBuffer, uint32_t val, int offset, uint8_t length) {
    for (int8_t i = length - 1; i >= 0; i--, offset++) {
        bitBuffer->data[offset >> 3] |= ((val >> i) & 1) << (7 - (offset & 7));
    }
}
*/
static void bb_setBit(BitBucket *bitGrid, uint8_t x, uint8_t y, bool on) {
    uint32_t offset = y * bitGrid->bitOffsetOrWidth + x;
    uint8_t mask = 1 << (7 - (offset & 0x07));
    if (on) {
        bitGrid->data[offset >> 3] |= mask;
    } else {
        bitGrid->data[offset >> 3] &= ~mask;
    }
}

static void bb_invertBit(BitBucket *bitGrid, uint8_t x, uint8_t y, bool invert) {
    uint32_t offset = y * bitGrid->bitOffsetOrWidth + x;
    uint8_t mask = 1 << (7 - (offset & 0x07));
    bool on = ((bitGrid->data[offset >> 3] & (1 << (7 - (offset & 0x07)))) != 0);
    if (on ^ invert) {
        bitGrid->data[offset >> 3] |= mask;
    } else {
        bitGrid->data[offset >> 3] &= ~mask;
    }
}

static bool bb_getBit(BitBucket *bitGrid, uint8_t x, uint8_t y) {
    uint32_t offset = y * bitGrid->bitOffsetOrWidth + x;
    return (bitGrid->data[offset >> 3] & (1 << (7 - (offset & 0x07)))) != 0;
}

#pragma mark - Drawing Patterns

// XORs the data modules in this QR Code with the given mask pattern. Due to XOR's mathematical
// properties, calling applyMask(m) twice with the same value is equivalent to no change at all.
// This means it is possible to apply a mask, undo it, and try another mask. Note that a final
// well-formed QR Code symbol needs exactly one mask applied (not zero, not two, etc.).
static void applyMask(BitBucket *modules, BitBucket *isFunction, uint8_t mask) {
    uint8_t size = modules->bitOffsetOrWidth;
    
    for (uint8_t y = 0; y < size; y++) {
        for (uint8_t x = 0; x < size; x++) {
            if (bb_getBit(isFunction, x, y)) { continue; }
            
            bool invert = 0;
            switch (mask) {
                case 0:  invert = (x + y) % 2 == 0;                    break;
                case 1:  invert = y % 2 == 0;                          break;
                case 2:  invert = x % 3 == 0;                          break;
                case 3:  invert = (x + y) % 3 == 0;                    break;
                case 4:  invert = (x / 3 + y / 2) % 2 == 0;            break;
                case 5:  invert = x * y % 2 + x * y % 3 == 0;          break;
                case 6:  invert = (x * y % 2 + x * y % 3) % 2 == 0;    break;
                case 7:  invert = ((x + y) % 2 + x * y % 3) % 2 == 0;  break;
            }
            bb_invertBit(modules, x, y, invert);
        }
    }
}

static void setFunctionModule(BitBucket *modules, BitBucket *isFunction, uint8_t x, uint8_t y, bool on) {
    bb_setBit(modules, x, y, on);
    bb_setBit(isFunction, x, y, true);
}

// Draws a 9*9 finder pattern including the border separator, with the center module at (x, y).
static void drawFinderPattern(BitBucket *modules, BitBucket *isFunction, uint8_t x, uint8_t y) {
    uint8_t size = modules->bitOffsetOrWidth;

    for (int8_t i = -4; i <= 4; i++) {
        for (int8_t j = -4; j <= 4; j++) {
            uint8_t dist = max(abs(i), abs(j));  // Chebyshev/infinity norm
            int16_t xx = x + j, yy = y + i;
            if (0 <= xx && xx < size && 0 <= yy && yy < size) {
                setFunctionModule(modules, isFunction, xx, yy, dist != 2 && dist != 4);
            }
        }
    }
}

// Draws a 5*5 alignment pattern, with the center module at (x, y).
static void drawAlignmentPattern(BitBucket *modules, BitBucket *isFunction, uint8_t x, uint8_t y) {
    for (int8_t i = -2; i <= 2; i++) {
        for (int8_t j = -2; j <= 2; j++) {
            setFunctionModule(modules, isFunction, x + j, y + i, max(abs(i), abs(j)) != 1);
        }
    }
}

// Draws two copies of the format bits (with its own error correction code)
// based on the given mask and this object's error correction level field.
static void drawFormatBits(BitBucket *modules, BitBucket *isFunction, uint8_t ecc, uint8_t mask) {
    
    uint8_t size = modules->bitOffsetOrWidth;

    // Calculate error correction code and pack bits
    uint32_t data = ecc << 3 | mask;  // errCorrLvl is uint2, mask is uint3
    uint32_t rem = data;
    for (int i = 0; i < 10; i++) {
        rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    }
    
    data = data << 10 | rem;
    data ^= 0x5412;  // uint15
    
    // Draw first copy
    for (uint8_t i = 0; i <= 5; i++) {
        setFunctionModule(modules, isFunction, 8, i, ((data >> i) & 1) != 0);
    }
    
    setFunctionModule(modules, isFunction, 8, 7, ((data >> 6) & 1) != 0);
    setFunctionModule(modules, isFunction, 8, 8, ((data >> 7) & 1) != 0);
    setFunctionModule(modules, isFunction, 7, 8, ((data >> 8) & 1) != 0);
    
    for (int8_t i = 9; i < 15; i++) {
        setFunctionModule(modules, isFunction, 14 - i, 8, ((data >> i) & 1) != 0);
    }
    
    // Draw second copy
    for (int8_t i = 0; i <= 7; i++) {
        setFunctionModule(modules, isFunction, size - 1 - i, 8, ((data >> i) & 1) != 0);
    }
    
    for (int8_t i = 8; i < 15; i++) {
        setFunctionModule(modules, isFunction, 8, size - 15 + i, ((data >> i) & 1) != 0);
    }
    
    setFunctionModule(modules, isFunction, 8, size - 8, true);
}

// Draws two copies of the version bits (with its own error correction code),
// based on this object's version field (which only has an effect for 7 <= version <= 40).
static void drawVersion(BitBucket *modules, BitBucket *isFunction, uint8_t version) {
    
    int8_t size = modules->bitOffsetOrWidth;

#if LOCK_VERSION != 0 && LOCK_VERSION < 7
    return;
    
#else
    if (version < 7) { return; }
    
    // Calculate error correction code and pack bits
    uint32_t rem = version;  // version is uint6, in the range [7, 40]
    for (uint8_t i = 0; i < 12; i++) {
        rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
    }
    
    uint32_t data = version << 12 | rem;  // uint18
    
    // Draw two copies
    for (uint8_t i = 0; i < 18; i++) {
        bool bit = ((data >> i) & 1) != 0;
        uint8_t a = size - 11 + i % 3, b = i / 3;
        setFunctionModule(modules, isFunction, a, b, bit);
        setFunctionModule(modules, isFunction, b, a, bit);
    }
    
#endif
}

static void drawFunctionPatterns(BitBucket *modules, BitBucket *isFunction, uint8_t version, uint8_t ecc) {
    
    uint8_t size = modules->bitOffsetOrWidth;

    // Draw the horizontal and vertical timing patterns
    for (uint8_t i = 0; i < size; i++) {
        setFunctionModule(modules, isFunction, 6, i, i % 2 == 0);
        setFunctionModule(modules, isFunction, i, 6, i % 2 == 0);
    }
    
    // Draw 3 finder patterns (all corners except bottom right; overwrites some timing modules)
    drawFinderPattern(modules, isFunction, 3, 3);
    drawFinderPattern(modules, isFunction, size - 4, 3);
    drawFinderPattern(modules, isFunction, 3, size - 4);
    
#if LOCK_VERSION == 0 || LOCK_VERSION > 1

    if (version > 1) {

        // Draw the numerous alignment patterns
        
        uint8_t alignCount = version / 7 + 2;
        uint8_t step;
        if (version != 32) {
            step = (version * 4 + alignCount * 2 + 1) / (2 * alignCount - 2) * 2;  // ceil((size - 13) / (2*numAlign - 2)) * 2
        } else { // C-C-C-Combo breaker!
            step = 26;
        }
        
        uint8_t alignPositionIndex = alignCount - 1;
        uint8_t alignPosition[alignCount];
        
        alignPosition[0] = 6;
        
        uint8_t size = version * 4 + 17;
        for (uint8_t i = 0, pos = size - 7; i < alignCount - 1; i++, pos -= step) {
            alignPosition[alignPositionIndex--] = pos;
        }
        
        for (uint8_t i = 0; i < alignCount; i++) {
            for (uint8_t j = 0; j < alignCount; j++) {
                if ((i == 0 && j == 0) || (i == 0 && j == alignCount - 1) || (i == alignCount - 1 && j == 0)) {
                    continue;  // Skip the three finder corners
                } else {
                    drawAlignmentPattern(modules, isFunction, alignPosition[i], alignPosition[j]);
                }
            }
        }
    }
    
#endif
    
    // Draw configuration data
    drawFormatBits(modules, isFunction, ecc, 0);  // Dummy mask value; overwritten later in the constructor
    drawVersion(modules, isFunction, version);
}

// Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
// data area of this QR Code symbol. Function modules need to be marked off before this is called.
static void drawCodewords(BitBucket *modules, BitBucket *isFunction, BitBucket *codewords) {
    
    uint32_t bitLength = codewords->bitOffsetOrWidth;
    uint8_t *data = codewords->data;
    
    uint8_t size = modules->bitOffsetOrWidth;
    
    // Bit index into the data
    uint32_t i = 0;
    
    // Do the funny zigzag scan
    for (int16_t right = size - 1; right >= 1; right -= 2) {  // Index of right column in each column pair
        if (right == 6) { right = 5; }
        
        for (uint8_t vert = 0; vert < size; vert++) {  // Vertical counter
            for (int j = 0; j < 2; j++) {
                uint8_t x = right - j;  // Actual x coordinate
                bool upwards = ((right & 2) == 0) ^ (x < 6);
                uint8_t y = upwards ? size - 1 - vert : vert;  // Actual y coordinate
                if (!bb_getBit(isFunction, x, y) && i < bitLength) {
                    bb_setBit(modules, x, y, ((data[i >> 3] >> (7 - (i & 7))) & 1) != 0);
                    i++;
                }
                // If there are any remainder bits (0 to 7), they are already
                // set to 0/false/white when the grid of modules was initialized
            }
        }
    }
}


#pragma mark - Penalty Calculation

#define PENALTY_N1      3
#define PENALTY_N2      3
#define PENALTY_N3     40
#define PENALTY_N4     10

// Calculates and returns the penalty score based on state of this QR Code's current modules.
// This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
// @TODO: This can be optimized by working with the bytes instead of bits.
static uint32_t getPenaltyScore(BitBucket *modules) {
    uint32_t result = 0;
    
    uint8_t size = modules->bitOffsetOrWidth;
    
    // Adjacent modules in row having same color
    for (uint8_t y = 0; y < size; y++) {
        
        bool colorX = bb_getBit(modules, 0, y);
        for (uint8_t x = 1, runX = 1; x < size; x++) {
            bool cx = bb_getBit(modules, x, y);
            if (cx != colorX) {
                colorX = cx;
                runX = 1;
                
            } else {
                runX++;
                if (runX == 5) {
                    result += PENALTY_N1;
                } else if (runX > 5) {
                    result++;
                }
            }
        }
    }
    
    // Adjacent modules in column having same color
    for (uint8_t x = 0; x < size; x++) {
        bool colorY = bb_getBit(modules, x, 0);
        for (uint8_t y = 1, runY = 1; y < size; y++) {
            bool cy = bb_getBit(modules, x, y);
            if (cy != colorY) {
                colorY = cy;
                runY = 1;
            } else {
                runY++;
                if (runY == 5) {
                    result += PENALTY_N1;
                } else if (runY > 5) {
                    result++;
                }
            }
        }
    }
    
    uint16_t black = 0;
    for (uint8_t y = 0; y < size; y++) {
        uint16_t bitsRow = 0, bitsCol = 0;
        for (uint8_t x = 0; x < size; x++) {
            bool color = bb_getBit(modules, x, y);

            // 2*2 blocks of modules having same color
            if (x > 0 && y > 0) {
                bool colorUL = bb_getBit(modules, x - 1, y - 1);
                bool colorUR = bb_getBit(modules, x, y - 1);
                bool colorL = bb_getBit(modules, x - 1, y);
                if (color == colorUL && color == colorUR && color == colorL) {
                    result += PENALTY_N2;
                }
            }

            // Finder-like pattern in rows and columns
            bitsRow = ((bitsRow << 1) & 0x7FF) | color;
            bitsCol = ((bitsCol << 1) & 0x7FF) | bb_getBit(modules, y, x);

            // Needs 11 bits accumulated
            if (x >= 10) {
                if (bitsRow == 0x05D || bitsRow == 0x5D0) {
                    result += PENALTY_N3;
                }
                if (bitsCol == 0x05D || bitsCol == 0x5D0) {
                    result += PENALTY_N3;
                }
            }

            // Balance of black and white modules
            if (color) { black++; }
        }
    }

    // Find smallest k such that (45-5k)% <= dark/total <= (55+5k)%
    uint16_t total = size * size;
    for (uint16_t k = 0; black * 20 < (9 - k) * total || black * 20 > (11 + k) * total; k++) {
        result += PENALTY_N4;
    }
    
    return result;
}

#pragma mark - Reed-Solomon Generator

static uint8_t rs_multiply(uint8_t x, uint8_t y) {
    // Russian peasant multiplication
    // See: https://en.wikipedia.org/wiki/Ancient_Egyptian_multiplication
    uint16_t z = 0;
    for (int8_t i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >> 7) * 0x11D);
        z ^= ((y >> i) & 1) * x;
    }
    return z;
}

static void rs_init(uint8_t degree, uint8_t *coeff) {
    memset(coeff, 0, degree);
    coeff[degree - 1] = 1;
    
    // Compute the product polynomial (x - r^0) * (x - r^1) * (x - r^2) * ... * (x - r^{degree-1}),
    // drop the highest term, and store the rest of the coefficients in order of descending powers.
    // Note that r = 0x02, which is a generator element of this field GF(2^8/0x11D).
    uint16_t root = 1;
    for (uint8_t i = 0; i < degree; i++) {
        // Multiply the current product by (x - r^i)
        for (uint8_t j = 0; j < degree; j++) {
            coeff[j] = rs_multiply(coeff[j], root);
            if (j + 1 < degree) {
                coeff[j] ^= coeff[j + 1];
            }
        }
        root = (root << 1) ^ ((root >> 7) * 0x11D);  // Multiply by 0x02 mod GF(2^8/0x11D)
    }
}

static void rs_getRemainder(uint8_t degree, uint8_t *coeff, uint8_t *data, uint8_t length, uint8_t *result, uint8_t stride) {
    // Compute the remainder by performing polynomial division
    
    //for (uint8_t i = 0; i < degree; i++) { result[] = 0; }
    //memset(result, 0, degree);
    
    for (uint8_t i = 0; i < length; i++) {
        uint8_t factor = data[i] ^ result[0];
        for (uint8_t j = 1; j < degree; j++) {
            result[(j - 1) * stride] = result[j * stride];
        }
        result[(degree - 1) * stride] = 0;
        
        for (uint8_t j = 0; j < degree; j++) {
            result[j * stride] ^= rs_multiply(coeff[j], factor);
        }
    }
}


#pragma mark - QrCode

static int8_t encodeDataCodewords(BitBucket *dataCodewords, const uint8_t *text, uint16_t length, uint8_t version) {
    int8_t mode = MODE_BYTE;
    
    if (isNumeric((char*)text, length)) {
        mode = MODE_NUMERIC;
        bb_appendBits(dataCodewords, 1 << MODE_NUMERIC, 4);
        bb_appendBits(dataCodewords, length, getModeBits(version, MODE_NUMERIC));

        uint16_t accumData = 0;
        uint8_t accumCount = 0;
        for (uint16_t i = 0; i < length; i++) {
            accumData = accumData * 10 + ((char)(text[i]) - '0');
            accumCount++;
            if (accumCount == 3) {
                bb_appendBits(dataCodewords, accumData, 10);
                accumData = 0;
                accumCount = 0;
            }
        }
        
        // 1 or 2 digits remaining
        if (accumCount > 0) {
            bb_appendBits(dataCodewords, accumData, accumCount * 3 + 1);
        }
        
    } else if (isAlphanumeric((char*)text, length)) {
        mode = MODE_ALPHANUMERIC;
        bb_appendBits(dataCodewords, 1 << MODE_ALPHANUMERIC, 4);
        bb_appendBits(dataCodewords, length, getModeBits(version, MODE_ALPHANUMERIC));

        uint16_t accumData = 0;
        uint8_t accumCount = 0;
        for (uint16_t i = 0; i  < length; i++) {
            accumData = accumData * 45 + getAlphanumeric((char)(text[i]));
            accumCount++;
            if (accumCount == 2) {
                bb_appendBits(dataCodewords, accumData, 11);
                accumData = 0;
                accumCount = 0;
            }
        }
        
        // 1 character remaining
        if (accumCount > 0) {
            bb_appendBits(dataCodewords, accumData, 6);
        }
        
    } else {
        bb_appendBits(dataCodewords, 1 << MODE_BYTE, 4);
        bb_appendBits(dataCodewords, length, getModeBits(version, MODE_BYTE));
        for (uint16_t i = 0; i < length; i++) {
            bb_appendBits(dataCodewords, (char)(text[i]), 8);
        }
    }
    
    //bb_setBits(dataCodewords, length, 4, getModeBits(version, mode));
    
    return mode;
}

static void performErrorCorrection(uint8_t version, uint8_t ecc, BitBucket *data) {
    
    // See: http://www.thonky.com/qr-code-tutorial/structure-final-message
    
#if LOCK_VERSION == 0
    uint8_t numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc][version - 1];
    uint16_t totalEcc = NUM_ERROR_CORRECTION_CODEWORDS[ecc][version - 1];
    uint16_t moduleCount = NUM_RAW_DATA_MODULES[version - 1];
#else
    uint8_t numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecc];
    uint16_t totalEcc = NUM_ERROR_CORRECTION_CODEWORDS[ecc];
    uint16_t moduleCount = NUM_RAW_DATA_MODULES;
#endif
    
    uint8_t blockEccLen = totalEcc / numBlocks;
    uint8_t numShortBlocks = numBlocks - moduleCount / 8 % numBlocks;
    uint8_t shortBlockLen = moduleCount / 8 / numBlocks;
    
    uint8_t shortDataBlockLen = shortBlockLen - blockEccLen;
    
    uint8_t result[data->capacityBytes];
    memset(result, 0, sizeof(result));
    
    uint8_t coeff[blockEccLen];
    rs_init(blockEccLen, coeff);
    
    uint16_t offset = 0;
    uint8_t *dataBytes = data->data;
    
    
    // Interleave all short blocks
    for (uint8_t i = 0; i < shortDataBlockLen; i++) {
        uint16_t index = i;
        uint8_t stride = shortDataBlockLen;
        for (uint8_t blockNum = 0; blockNum < numBlocks; blockNum++) {
            result[offset++] = dataBytes[index];
            
#if LOCK_VERSION == 0 || LOCK_VERSION >= 5
            if (blockNum == numShortBlocks) { stride++; }
#endif
            index += stride;
        }
    }
    
    // Version less than 5 only have short blocks
#if LOCK_VERSION == 0 || LOCK_VERSION >= 5
    {
        // Interleave long blocks
        uint16_t index = shortDataBlockLen * (numShortBlocks + 1);
        uint8_t stride = shortDataBlockLen;
        for (uint8_t blockNum = 0; blockNum < numBlocks - numShortBlocks; blockNum++) {
            result[offset++] = dataBytes[index];
            
            if (blockNum == 0) { stride++; }
            index += stride;
        }
    }
#endif
    
    // Add all ecc blocks, interleaved
    uint8_t blockSize = shortDataBlockLen;
    for (uint8_t blockNum = 0; blockNum < numBlocks; blockNum++) {
        
#if LOCK_VERSION == 0 || LOCK_VERSION >= 5
        if (blockNum == numShortBlocks) { blockSize++; }
#endif
        rs_getRemainder(blockEccLen, coeff, dataBytes, blockSize, &result[offset + blockNum], numBlocks);
        dataBytes += blockSize;
    }
    
    memcpy(data->data, result, data->capacityBytes);
    data->bitOffsetOrWidth = moduleCount;
}

// We store the Format bits tightly packed into a single byte (each of the 4 modes is 2 bits)
// The format bits can be determined by ECC_FORMAT_BITS >> (2 * ecc)
static const uint8_t ECC_FORMAT_BITS = (0x02 << 6) | (0x03 << 4) | (0x00 << 2) | (0x01 << 0);

#pragma mark - Public QRCode functions

uint16_t qrcode_getBufferSize(uint8_t version) {
    return bb_getGridSizeBytes(4 * version + 17);
}

// @TODO: Return error if data is too big.
int8_t qrcode_initBytes(QRCode *qrcode, uint8_t *modules, uint8_t version, uint8_t ecc, uint8_t *data, uint16_t length) {
    uint8_t size = version * 4 + 17;
    qrcode->version = version;
    qrcode->size = size;
    qrcode->ecc = ecc;
    qrcode->modules = modules;
    
    uint8_t eccFormatBits = (ECC_FORMAT_BITS >> (2 * ecc)) & 0x03;
    
#if LOCK_VERSION == 0
    uint16_t moduleCount = NUM_RAW_DATA_MODULES[version - 1];
    uint16_t dataCapacity = moduleCount / 8 - NUM_ERROR_CORRECTION_CODEWORDS[eccFormatBits][version - 1];
#else
    version = LOCK_VERSION;
    uint16_t moduleCount = NUM_RAW_DATA_MODULES;
    uint16_t dataCapacity = moduleCount / 8 - NUM_ERROR_CORRECTION_CODEWORDS[eccFormatBits];
#endif
    
    struct BitBucket codewords;
    uint8_t codewordBytes[bb_getBufferSizeBytes(moduleCount)];
    bb_initBuffer(&codewords, codewordBytes, (int32_t)sizeof(codewordBytes));
    
    // Place the data code words into the buffer
    int8_t mode = encodeDataCodewords(&codewords, data, length, version);
    
    if (mode < 0) { return -1; }
    qrcode->mode = mode;
    
    // Add terminator and pad up to a byte if applicable
    uint32_t padding = (dataCapacity * 8) - codewords.bitOffsetOrWidth;
    if (padding > 4) { padding = 4; }
    bb_appendBits(&codewords, 0, padding);
    bb_appendBits(&codewords, 0, (8 - codewords.bitOffsetOrWidth % 8) % 8);

    // Pad with alternate bytes until data capacity is reached
    for (uint8_t padByte = 0xEC; codewords.bitOffsetOrWidth < (dataCapacity * 8); padByte ^= 0xEC ^ 0x11) {
        bb_appendBits(&codewords, padByte, 8);
    }

    BitBucket modulesGrid;
    bb_initGrid(&modulesGrid, modules, size);
    
    BitBucket isFunctionGrid;
    uint8_t isFunctionGridBytes[bb_getGridSizeBytes(size)];
    bb_initGrid(&isFunctionGrid, isFunctionGridBytes, size);
    
    // Draw function patterns, draw all codewords, do masking
    drawFunctionPatterns(&modulesGrid, &isFunctionGrid, version, eccFormatBits);
    performErrorCorrection(version, eccFormatBits, &codewords);
    drawCodewords(&modulesGrid, &isFunctionGrid, &codewords);
    
    // Find the best (lowest penalty) mask
    uint8_t mask = 0;
    int32_t minPenalty = INT32_MAX;
    for (uint8_t i = 0; i < 8; i++) {
        drawFormatBits(&modulesGrid, &isFunctionGrid, eccFormatBits, i);
        applyMask(&modulesGrid, &isFunctionGrid, i);
        int penalty = getPenaltyScore(&modulesGrid);
        if (penalty < minPenalty) {
            mask = i;
            minPenalty = penalty;
        }
        applyMask(&modulesGrid, &isFunctionGrid, i);  // Undoes the mask due to XOR
    }
    
    qrcode->mask = mask;
    
    // Overwrite old format bits
    drawFormatBits(&modulesGrid, &isFunctionGrid, eccFormatBits, mask);
    
    // Apply the final choice of mask
    applyMask(&modulesGrid, &isFunctionGrid, mask);

    return 0;
}

int8_t qrcode_initText(QRCode *qrcode, uint8_t *modules, uint8_t version, uint8_t ecc, const char *data) {
    return qrcode_initBytes(qrcode, modules, version, ecc, (uint8_t*)data, strlen(data));
}

bool qrcode_getModule(QRCode *qrcode, uint8_t x, uint8_t y) {
    if (x < 0 || x >= qrcode->size || y < 0 || y >= qrcode->size) {
        return false;
    }

    uint32_t offset = y * qrcode->size + x;
    return (qrcode->modules[offset >> 3] & (1 << (7 - (offset & 0x07)))) != 0;
}

/*
uint8_t qrcode_getHexLength(QRCode *qrcode) {
    return ((qrcode->size * qrcode->size) + 7) / 4;
}

void qrcode_getHex(QRCode *qrcode, char *result) {
    
}
*/


qrcode.h

/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 Richard Moore
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 *  Special thanks to Nayuki (https://www.nayuki.io/) from which this library was
 *  heavily inspired and compared against.
 *
 *  See: https://github.com/nayuki/QR-Code-generator/tree/master/cpp
 */

#ifndef __QRCODE_H_
#define __QRCODE_H_

#ifndef __cplusplus
typedef unsigned char bool;
static const bool false = 0;
static const bool true = 1;
#endif

#include <stdint.h>

// QR Code Format Encoding
#define MODE_NUMERIC        0
#define MODE_ALPHANUMERIC   1
#define MODE_BYTE           2

// Error Correction Code Levels
#define ECC_LOW            0
#define ECC_MEDIUM         1
#define ECC_QUARTILE       2
#define ECC_HIGH           3

// If set to non-zero, this library can ONLY produce QR codes at that version
// This saves a lot of dynamic memory, as the codeword tables are skipped
#ifndef LOCK_VERSION
#define LOCK_VERSION       0
#endif

typedef struct QRCode {
    uint8_t version;
    uint8_t size;
    uint8_t ecc;
    uint8_t mode;
    uint8_t mask;
    uint8_t *modules;
} QRCode;

#ifdef __cplusplus
extern "C"{
#endif  /* __cplusplus */


uint16_t qrcode_getBufferSize(uint8_t version);

int8_t qrcode_initText(QRCode *qrcode, uint8_t *modules, uint8_t version, uint8_t ecc, const char *data);
int8_t qrcode_initBytes(QRCode *qrcode, uint8_t *modules, uint8_t version, uint8_t ecc, uint8_t *data, uint16_t length);

bool qrcode_getModule(QRCode *qrcode, uint8_t x, uint8_t y);


#ifdef __cplusplus
}
#endif  /* __cplusplus */

#endif  /* __QRCODE_H_ */


sketch_sep4c.ino

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

// ============================================================
// SENTINELVAULT ESP32-CAM - FINAL PRESENTATION FIRMWARE
// ============================================================
// Browser-side QR decoding is intentional for presentation.
// The CAM hosts the video stream and browser UI.
// jsQR runs in the browser, then POSTs decoded QR JSON back to /qr.
// The CAM forwards the complete JSON to Main ESP32 over UART.
//
// UART:
// CAM GPIO13 TX -> MAIN GPIO16 RX
// CAM GPIO14 RX <- MAIN GPIO17 TX
// GND            -> MAIN GND
// ============================================================

const char *ssid = "VITC-EVENT";
const char *password = "Tecv!t#03&04$";

// AI Thinker camera pins
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM       5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

HardwareSerial MainUART(1);
#define CAM_TX 13
#define CAM_RX 14

WebServer server(80);
WiFiServer streamServer(81);
WiFiClient streamClient;

const size_t MAX_QR_PAYLOAD = 12000;
const unsigned long HEARTBEAT_INTERVAL = 3000;
const unsigned long STREAM_INTERVAL = 40;
const unsigned long QR_REPEAT_SUPPRESS_MS = 6000;

bool cameraReady = false;
bool wifiReady = false;
unsigned long lastHeartbeat = 0;
unsigned long lastStreamFrame = 0;
String lastPayload;
unsigned long lastPayloadTime = 0;

// ============================================================
// Logging
// ============================================================
void camLocalLog(const String &msg) {
  Serial.println(msg);
}

void camLog(const String &msg) {
  Serial.println(msg);
  MainUART.println(msg);
}

void sendPayloadFrame(const String &payload) {
  if (payload.length() == 0 || payload.length() >= MAX_QR_PAYLOAD) {
    camLog("[CAM] PAYLOAD TOO LARGE - NOT SENT");
    return;
  }

  camLog("[CAM] PAYLOAD_BEGIN");
  MainUART.println(payload);
  camLog("[CAM] PAYLOAD_END");
  camLog(String("[CAM] PAYLOAD SENT TO MAIN (") + payload.length() + " bytes)");
}

// ============================================================
// Browser UI
// ============================================================
void handleRoot() {
  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SentinelVault Camera</title>
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<style>
body{background:#101010;color:#fff;font-family:Arial,sans-serif;text-align:center;margin:0;padding:18px}
h1{margin:8px 0}.sub{color:#aaa;margin-bottom:14px}
#stream{width:96%;max-width:900px;border:2px solid #444;border-radius:8px}
#canvas{display:none}
#status{margin:15px auto;padding:14px;max-width:900px;background:#202020;border-radius:8px;word-break:break-word;font-family:monospace}
#details{margin:15px auto;padding:14px;max-width:900px;background:#181818;border-radius:8px;text-align:left;white-space:pre-wrap;font-family:monospace}
.ok{font-size:18px}.small{color:#aaa}
</style>
</head>
<body>
<h1>SentinelVault</h1>
<div class="sub">ESP32-CAM live transaction scanner • browser-side jsQR</div>
<img id="stream" crossorigin="anonymous" alt="ESP32-CAM stream">
<canvas id="canvas"></canvas>
<div id="status">Starting scanner...</div>
<div id="details" class="small">Waiting for transaction QR...</div>
<script>
const stream=document.getElementById('stream');
const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d',{willReadFrequently:true});
const status=document.getElementById('status');
const details=document.getElementById('details');
const ip=window.location.hostname;
stream.src='http://'+ip+':81/stream';
let lastQR=''; let lastSent=0;
const DUP_MS=6000;

function summarize(payload){
  try{
    const o=JSON.parse(payload);
    const t=o.transaction||{};
    const r=o.riskAnalysis||{};
    return 'transactionId : '+(t.transactionId||'')+'\n'
      +'chain         : '+(t.chain||'')+'\n'
      +'type          : '+(o.type||'')+'\n'
      +'risk          : '+(r.riskLevel||'')+' / '+(r.riskScore??'')+'\n'
      +'recommendation: '+(r.recommendation||'');
  }catch(e){return payload.slice(0,1200)}
}

async function reportQR(payload){
  const now=Date.now();
  if(payload===lastQR && now-lastSent<DUP_MS) return;
  lastQR=payload; lastSent=now;
  status.innerText='QR DETECTED — sending to SentinelVault...';
  details.innerText=summarize(payload);
  try{
    const res=await fetch('/qr',{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},
      body:payload
    });
    const text=await res.text();
    status.innerText='QR RESULT: '+text;
  }catch(e){
    status.innerText='QR SEND ERROR: '+e;
  }
}

let jsqrReady = false;

function scanQR(){
  if(stream.naturalWidth===0 || stream.naturalHeight===0){
    status.innerText='Waiting for camera stream...';
    return;
  }
  if(!jsqrReady){
    status.innerText='Loading QR decoder...';
    return;
  }
  let width=stream.naturalWidth, height=stream.naturalHeight;
  const maxWidth=960;
  if(width>maxWidth){const s=maxWidth/width;width=Math.floor(width*s);height=Math.floor(height*s)}
  canvas.width=width;canvas.height=height;
  ctx.drawImage(stream,0,0,width,height);
  const image=ctx.getImageData(0,0,width,height);
  let code = null;
  try {
    code = jsQR(image.data,width,height,{inversionAttempts:'attemptBoth'});
  } catch(e) {
    status.innerText='QR scan error: '+e;
    return;
  }
  if(code){reportQR(code.data)}
  else status.innerText='Scanning for QR...';
}
if(typeof jsQR==='function'){
  jsqrReady = true;
  status.innerText='Scanner ready — show transaction QR';
}else{
  status.innerText='QR decoder not loaded';
}
setInterval(scanQR,220);
</script>
</body>
</html>
)rawliteral";

  server.send(200, "text/html", html);
}

// ============================================================
// QR POST endpoint
// ============================================================
void handleQRPost() {
  String payload = server.arg("plain");
  payload.trim();

  if (payload.length() == 0) {
    server.send(400, "text/plain", "EMPTY_PAYLOAD");
    camLog("[CAM] QR endpoint received empty payload");
    return;
  }
  if (payload.length() >= MAX_QR_PAYLOAD) {
    server.send(413, "text/plain", "PAYLOAD_TOO_LARGE");
    camLog("[CAM] QR payload too large");
    return;
  }

  camLog("[CAM] QR DETECTED");
  Serial.printf("[CAM] QR payload length: %u bytes\n", (unsigned)payload.length());

  // Only JSON SentinelVault protocol is accepted now.
  if (!payload.startsWith("{")) {
    camLog("[CAM] WRONG QR - NOT JSON");
    server.send(400, "text/plain", "WRONG_QR");
    return;
  }

  // Prevent accidental repeated sends during browser scans.
  if (payload == lastPayload && millis() - lastPayloadTime < QR_REPEAT_SUPPRESS_MS) {
    camLog("[CAM] SAME QR - DUPLICATE SUPPRESSED");
    server.send(200, "text/plain", "DUPLICATE_SUPPRESSED");
    return;
  }

  lastPayload = payload;
  lastPayloadTime = millis();

  camLog("[CAM] VALID JSON QR RECEIVED");
  sendPayloadFrame(payload);
  server.send(200, "text/plain", "QR_FORWARDED_TO_MAIN");
}

// ============================================================
// MJPEG stream
// ============================================================
void handleStreamClient() {
  if (!streamClient || !streamClient.connected()) {
    WiFiClient newClient = streamServer.available();
    if (newClient) {
      streamClient.stop();
      streamClient = newClient;
      streamClient.print("HTTP/1.1 200 OK\r\n");
      streamClient.print("Content-Type: multipart/x-mixed-replace; boundary=frame\r\n");
      streamClient.print("Cache-Control: no-cache\r\n");
      streamClient.print("Access-Control-Allow-Origin: *\r\n");
      streamClient.print("Connection: close\r\n\r\n");
      camLog("[CAM] STREAM CLIENT CONNECTED");
    }
    return;
  }

  if (millis() - lastStreamFrame < STREAM_INTERVAL) return;
  lastStreamFrame = millis();

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    camLog("[CAM] CAMERA CAPTURE FAILED");
    streamClient.stop();
    return;
  }

  streamClient.print("--frame\r\n");
  streamClient.print("Content-Type: image/jpeg\r\n");
  streamClient.print("Content-Length: ");
  streamClient.print(fb->len);
  streamClient.print("\r\n\r\n");
  streamClient.write(fb->buf, fb->len);
  streamClient.print("\r\n");
  esp_camera_fb_return(fb);
}

// ============================================================
// Commands from Main
// ============================================================
void processMainUART() {
  static String incoming;
  while (MainUART.available()) {
    char c=(char)MainUART.read();
    if(c=='\n'){
      incoming.trim();
      if(incoming.length()){
        Serial.print("[CAM] FROM MAIN: ");
        Serial.println(incoming);
        if(incoming=="[MAIN] PING"){
          MainUART.println("[CAM] PONG");
          Serial.println("[CAM] PONG");
        }
      }
      incoming="";
    }else if(c!='\r'){
      if(incoming.length()<600) incoming+=c;
      else incoming="";
    }
  }
}

// ============================================================
// Camera init
// ============================================================
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }

  esp_err_t err=esp_camera_init(&config);
  if(err!=ESP_OK){
    Serial.printf("[CAM] CAMERA INIT FAILED: 0x%x\n",err);
    MainUART.println("[CAM] CAMERA INIT FAILED");
    return false;
  }

  cameraReady=true;
  camLog("[CAM] CAMERA INITIALIZED");
  return true;
}

// ============================================================
// Setup
// ============================================================
void setup(){
  Serial.begin(115200);
  delay(800);

  Serial.println();
  Serial.println("============================================================");
  Serial.println("               SENTINELVAULT ESP32-CAM                     ");
  Serial.println("                  FINAL DEMO FIRMWARE                      ");
  Serial.println("============================================================");

  MainUART.begin(115200,SERIAL_8N1,CAM_RX,CAM_TX);
  camLog("[CAM] UART INITIALIZED @115200");

  if(!initCamera()) return;

  WiFi.begin(ssid,password);
  camLocalLog("[CAM] Connecting to Wi-Fi...");
  unsigned long wifiStart=millis();
  while(WiFi.status()!=WL_CONNECTED && millis()-wifiStart<20000){
    delay(300);
    Serial.print('.');
  }
  Serial.println();

  if(WiFi.status()==WL_CONNECTED){
    wifiReady=true;
    String ip=WiFi.localIP().toString();
    camLog("[CAM] WIFI CONNECTED");
    camLog("[CAM] IP: "+ip);
  }else{
    camLog("[CAM] WIFI CONNECTION FAILED");
    return;
  }

  server.on("/",HTTP_GET,handleRoot);
  server.on("/qr",HTTP_POST,handleQRPost);
  server.begin();
  streamServer.begin();

  camLog("[CAM] HTTP SERVER STARTED");
  camLog("[CAM] LIVE STREAM READY");
  camLog("[CAM] BROWSER QR SCANNER READY");
  camLog("[CAM] JSQR MODE ACTIVE");
  camLog("[CAM] SYSTEM ONLINE");
}

// ============================================================
// Loop
// ============================================================
void loop(){
  server.handleClient();
  handleStreamClient();
  processMainUART();

  if(millis()-lastHeartbeat>=HEARTBEAT_INTERVAL){
    lastHeartbeat=millis();
    MainUART.println("[CAM] HEARTBEAT");
    Serial.println("[CAM] HEARTBEAT");
  }
  delay(1);
}


