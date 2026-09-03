import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

from sklearn.ensemble import RandomForestClassifier
from imblearn.over_sampling import SMOTE
from xgboost import XGBClassifier


# ======================
# 1. LOAD DATA
# ======================
df = pd.read_csv("transaction_dataset.csv")


# ======================
# 2. CLEAN DATA
# ======================
df = df.drop(columns=["Unnamed: 0", "Index", "Address"], errors='ignore')

df = df.drop(columns=[
    " ERC20 most sent token type",
    " ERC20_most_rec_token_type"
], errors='ignore')

df = df.fillna(0)


# ======================
# 3. FEATURES & LABEL
# ======================
X = df.drop("FLAG", axis=1)
y = df["FLAG"]

# Save feature order (IMPORTANT)
joblib.dump(X.columns.tolist(), "features.pkl")


# ======================
# 4. TRAIN-TEST SPLIT
# ======================
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)


# ======================
# 5. HANDLE IMBALANCE (SMOTE)
# ======================
sm = SMOTE(random_state=42)
X_train, y_train = sm.fit_resample(X_train, y_train)

print("After SMOTE:\n", pd.Series(y_train).value_counts())


# ======================
# 6. MODEL 1: RANDOM FOREST
# ======================
rf_model = RandomForestClassifier(
    n_estimators=200,
    max_depth=10,
    min_samples_split=5,
    n_jobs=-1,
    random_state=42,
    class_weight={0:1, 1:2}
)

rf_model.fit(X_train, y_train)

# 🔥 Use threshold tuning
rf_probs = rf_model.predict_proba(X_test)[:, 1]
rf_pred = (rf_probs > 0.4).astype(int)

print("\n===== Random Forest =====")
print("Accuracy:", accuracy_score(y_test, rf_pred))
print(classification_report(y_test, rf_pred))


# ======================
# 7. MODEL 2: XGBOOST
# ======================
xgb_model = XGBClassifier(
    n_estimators=200,
    learning_rate=0.1,
    max_depth=6,
    use_label_encoder=False,
    eval_metric='logloss'
)

xgb_model.fit(X_train, y_train)

xgb_pred = xgb_model.predict(X_test)

print("\n===== XGBoost =====")
print("Accuracy:", accuracy_score(y_test, xgb_pred))
print(classification_report(y_test, xgb_pred))


# ======================
# 8. CHOOSE BEST MODEL
# ======================
# You can change this after comparing results
best_model = rf_model   # or xgb_model


# ======================
# 9. RISK SCORE
# ======================
probs = best_model.predict_proba(X_test)
risk_scores = probs[:, 1] * 100

print("\nSample Risk Scores:", risk_scores[:5])


# ======================
# 10. SAVE MODEL
# ======================
joblib.dump(best_model, "crypto_model.pkl")

print("\n🔥 Best model saved as crypto_model.pkl")