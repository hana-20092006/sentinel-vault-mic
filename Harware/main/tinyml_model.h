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
