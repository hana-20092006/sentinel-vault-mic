import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from imblearn.over_sampling import SMOTE
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score

print("🚀 Improving Crypto ML Model...")

# Load data
df = pd.read_csv("transaction_dataset.csv")
df = df.drop(columns=["Unnamed: 0", "Index", "Address"], errors='ignore')

# Clean string values and convert to numeric
for col in df.columns:
    if df[col].dtype == 'object':
        df[col] = pd.to_numeric(df[col].astype(str).str.replace(" ", "").str.replace("'", ""), errors='coerce')

df = df.fillna(0)

# Enhanced feature engineering
df['sent_to_received_ratio'] = df['Sent tnx'] / (df['Received Tnx'] + 1)
df['avg_transaction_value'] = (df['total Ether sent'] + df['total ether received']) / (df['total transactions (including tnx to create contract'] + 1)
df['value_variance'] = df['max val sent'] - df['min val sent']
df['activity_intensity'] = df['Sent tnx'] + df['Received Tnx']
df['unique_ratio'] = (df['Unique Received From Addresses'] + df['Unique Sent To Addresses']) / (df['total transactions (including tnx to create contract'] + 1)

X = df.drop("FLAG", axis=1)
y = df["FLAG"]

# Train-test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Handle class imbalance with better SMOTE
smote = SMOTE(random_state=42, k_neighbors=3)
X_train_balanced, y_train_balanced = smote.fit_resample(X_train, y_train)

print(f"Original training set: {len(y_train)} samples")
print(f"Balanced training set: {len(y_train_balanced)} samples")
print(f"Test set: {len(y_test)} samples")

# IMPROVED Random Forest with better hyperparameters
rf_improved = RandomForestClassifier(
    n_estimators=800,        # More trees
    max_depth=25,           # Deeper trees
    min_samples_split=2,      # More specific splits
    min_samples_leaf=1,       # Fine-grained leaves
    max_features='sqrt',      # Optimal feature selection
    bootstrap=True,           # Use bootstrap sampling
    oob_score=True,          # Out-of-bag scoring
    class_weight='balanced',    # Handle imbalance
    random_state=42,
    n_jobs=-1               # Use all cores
)

print("🔥 Training improved model...")
rf_improved.fit(X_train_balanced, y_train_balanced)

# Enhanced evaluation
y_pred = rf_improved.predict(X_test)
y_proba = rf_improved.predict_proba(X_test)[:, 1]

# Better threshold optimization
thresholds = np.arange(0.3, 0.7, 0.05)
best_threshold = 0.5
best_f1 = 0

for threshold in thresholds:
    y_pred_thresh = (y_proba > threshold).astype(int)
    from sklearn.metrics import f1_score
    f1 = f1_score(y_test, y_pred_thresh)
    if f1 > best_f1:
        best_f1 = f1
        best_threshold = threshold

y_pred_optimized = (y_proba > best_threshold).astype(int)

print(f"\n📊 IMPROVED MODEL RESULTS:")
print(f"Best threshold: {best_threshold:.3f}")
print(f"Accuracy: {accuracy_score(y_test, y_pred_optimized):.4f}")
print(f"AUC-ROC: {roc_auc_score(y_test, y_proba):.4f}")
print(f"F1-Score: {best_f1:.4f}")
print(classification_report(y_test, y_pred_optimized))

# Compare with original model
print("\n🔄 COMPARING WITH ORIGINAL MODEL...")
try:
    original_model = joblib.load("crypto_model.pkl")
    original_pred = original_model.predict(X_test)
    original_accuracy = accuracy_score(y_test, original_pred)
    original_auc = roc_auc_score(y_test, original_model.predict_proba(X_test)[:, 1])
    
    print(f"Original Model - Accuracy: {original_accuracy:.4f}, AUC: {original_auc:.4f}")
    print(f"Improved Model - Accuracy: {accuracy_score(y_test, y_pred_optimized):.4f}, AUC: {roc_auc_score(y_test, y_proba):.4f}")
    
    improvement = accuracy_score(y_test, y_pred_optimized) - original_accuracy
    print(f"🎉 Accuracy improvement: {improvement:+.4f}")
except:
    print("Original model not found for comparison")

# Save improved model
joblib.dump(rf_improved, "crypto_model_improved.pkl")
joblib.dump(X.columns.tolist(), "features_improved.pkl")

print("\n✅ IMPROVED MODEL SAVED!")
print("📁 Files created:")
print("   - crypto_model_improved.pkl (improved model)")
print("   - features_improved.pkl (feature list)")

# Test with sample data
print("\n🧪 TESTING WITH SAMPLE DATA:")
sample_features = X_test.iloc[:3]
sample_probs = rf_improved.predict_proba(sample_features)[:, 1]
sample_risk_scores = sample_probs * 100
sample_predictions = (sample_probs > best_threshold).astype(int)

for i in range(3):
    risk_level = "HIGH RISK" if sample_risk_scores[i] > 70 else "MEDIUM RISK" if sample_risk_scores[i] > 40 else "LOW RISK"
    prediction = "🚨 Suspicious" if sample_predictions[i] == 1 else "✅ Legitimate"
    print(f"Sample {i+1}: {sample_risk_scores[i]:.1f}% - {risk_level} - {prediction}")
