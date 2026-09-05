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

const char *ssid = "";
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
