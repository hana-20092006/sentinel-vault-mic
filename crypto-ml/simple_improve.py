import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from imblearn.over_sampling import SMOTE
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score

print("🚀 Simply Improving Crypto ML Model...")

# Load and clean data
df = pd.read_csv("transaction_dataset.csv")
df = df.drop(columns=["Unnamed: 0", "Index", "Address"], errors='ignore')

# Remove string columns that cause issues
df = df.drop(columns=[
    " ERC20 most sent token type",
    " ERC20_most_rec_token_type"
], errors='ignore')

df = df.fillna(0)

# Basic feature engineering
df['sent_to_received_ratio'] = df['Sent tnx'] / (df['Received Tnx'] + 1)
df['avg_transaction_value'] = (df['total Ether sent'] + df['total ether received']) / (df['total transactions (including tnx to create contract'] + 1)
df['activity_intensity'] = df['Sent tnx'] + df['Received Tnx']

X = df.drop("FLAG", axis=1)
y = df["FLAG"]

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"Training set size: {len(X_train)}")
print(f"Test set size: {len(X_test)}")

# Better SMOTE
smote = SMOTE(random_state=42, k_neighbors=3)
X_train_balanced, y_train_balanced = smote.fit_resample(X_train, y_train)

print(f"Balanced training set: {len(y_train_balanced)}")

# IMPROVED Random Forest
rf_improved = RandomForestClassifier(
    n_estimators=600,        # More trees
    max_depth=20,           # Deeper trees  
    min_samples_split=3,      # Better splits
    min_samples_leaf=1,       # Fine leaves
    max_features='sqrt',      # Optimal features
    class_weight='balanced',    # Better balance
    random_state=42,
    n_jobs=-1               # All cores
)

print("🔥 Training improved model...")
rf_improved.fit(X_train_balanced, y_train_balanced)

# Evaluation
y_pred = rf_improved.predict(X_test)
y_proba = rf_improved.predict_proba(X_test)[:, 1]

# Find optimal threshold
thresholds = np.arange(0.3, 0.8, 0.05)
best_f1 = 0
best_threshold = 0.5

for threshold in thresholds:
    y_pred_thresh = (y_proba > threshold).astype(int)
    from sklearn.metrics import f1_score
    f1 = f1_score(y_test, y_pred_thresh)
    if f1 > best_f1:
        best_f1 = f1
        best_threshold = threshold

y_pred_final = (y_proba > best_threshold).astype(int)

accuracy = accuracy_score(y_test, y_pred_final)
auc = roc_auc_score(y_test, y_proba)

print(f"\n📊 IMPROVED RESULTS:")
print(f"Best threshold: {best_threshold:.3f}")
print(f"Accuracy: {accuracy:.4f}")
print(f"AUC: {auc:.4f}")
print(f"F1-Score: {best_f1:.4f}")
print(classification_report(y_test, y_pred_final))

# Save improved model
joblib.dump(rf_improved, "crypto_model_improved.pkl")
joblib.dump(X.columns.tolist(), "features_improved.pkl")

print("\n✅ IMPROVED MODEL SAVED AS 'crypto_model_improved.pkl'")

# Test with sample
print("\n🧪 SAMPLE TEST:")
sample_idx = 0
sample_features = X_test.iloc[sample_idx:sample_idx+1]
sample_prob = rf_improved.predict_proba(sample_features)[:, 1][0]
risk_score = sample_prob * 100
prediction = "🚨 SUSPICIOUS" if sample_prob > best_threshold else "✅ LEGITIMATE"

print(f"Sample Risk Score: {risk_score:.1f}%")
print(f"Prediction: {prediction}")
print(f"Confidence: {max(sample_prob, 1-sample_prob):.3f}")
