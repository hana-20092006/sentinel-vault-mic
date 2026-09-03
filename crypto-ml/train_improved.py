import pandas as pd
import numpy as np
import joblib
import warnings
warnings.filterwarnings('ignore')

from sklearn.model_selection import train_test_split, GridSearchCV, cross_val_score
from sklearn.metrics import classification_report, accuracy_score, roc_auc_score, precision_recall_curve, confusion_matrix
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.feature_selection import SelectKBest, f_classif
from imblearn.over_sampling import SMOTE, ADASYN
from imblearn.under_sampling import RandomUnderSampler
from xgboost import XGBClassifier
from sklearn.linear_model import LogisticRegression

# ======================
# 1. LOAD DATA
# ======================
df = pd.read_csv("transaction_dataset.csv")
print("Original dataset shape:", df.shape)
print("Class distribution:\n", df["FLAG"].value_counts())

# ======================
# 2. ENHANCED FEATURE ENGINEERING
# ======================
df = df.drop(columns=["Unnamed: 0", "Index", "Address"], errors='ignore')
df = df.drop(columns=[
    " ERC20 most sent token type",
    " ERC20_most_rec_token_type"
], errors='ignore')

# Fill missing values
df = df.fillna(0)

# Create new features
df['total_transactions_log'] = np.log1p(df['total transactions (including tnx to create contract'])
df['sent_to_received_ratio'] = df['Sent tnx'] / (df['Received Tnx'] + 1)
df['avg_transaction_value'] = (df['total Ether sent'] + df['total ether received']) / (df['total transactions (including tnx to create contract'] + 1)
df['value_variance'] = df['max val sent'] - df['min val sent']
df['time_activity_ratio'] = df['Time Diff between first and last (Mins)'] / (df['total transactions (including tnx to create contract'] + 1)
df['unique_addresses_ratio'] = (df['Unique Received From Addresses'] + df['Unique Sent To Addresses']) / (df['total transactions (including tnx to create contract'] + 1)
df['erc20_activity_ratio'] = df[' Total ERC20 tnxs'] / (df['total transactions (including tnx to create contract'] + 1)

# Interaction features
df['high_value_freq'] = ((df['max val sent'] > 1.0) & (df['Sent tnx'] > 50)).astype(int)
df['rapid_activity'] = ((df['Avg min between sent tnx'] < 1) & (df['Sent tnx'] > 100)).astype(int)
df['diverse_activity'] = ((df['Unique Sent To Addresses'] > 50) & (df['Unique Received From Addresses'] > 50)).astype(int)

print("Enhanced features shape:", df.shape)

# ======================
# 3. FEATURES & LABEL
# ======================
X = df.drop("FLAG", axis=1)
y = df["FLAG"]

# Save feature order
joblib.dump(X.columns.tolist(), "features_improved.pkl")

# ======================
# 4. ADVANCED DATA PREPROCESSING
# ======================
# Feature scaling
scaler = RobustScaler()
X_scaled = scaler.fit_transform(X)
X = pd.DataFrame(X_scaled, columns=X.columns)

# Feature selection
selector = SelectKBest(f_classif, k=40)  # Keep top 40 features
X_selected = selector.fit_transform(X, y)
selected_features = X.columns[selector.get_support()].tolist()
X = pd.DataFrame(X_selected, columns=selected_features)

print("Selected features:", len(selected_features))

# ======================
# 5. IMPROVED TRAIN-TEST SPLIT
# ======================
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.25, random_state=42, stratify=y
)

print("Train set distribution:\n", pd.Series(y_train).value_counts())
print("Test set distribution:\n", pd.Series(y_test).value_counts())

# ======================
# 6. ADVANCED CLASS IMBALANCE HANDLING
# ======================
# Combine SMOTE with undersampling for better balance
smote = SMOTE(random_state=42, k_neighbors=5)
X_train_resampled, y_train_resampled = smote.fit_resample(X_train, y_train)

print("After SMOTE:\n", pd.Series(y_train_resampled).value_counts())

# ======================
# 7. HYPERPARAMETER TUNING
# ======================

# Random Forest with optimized parameters
rf_params = {
    'n_estimators': [300, 500, 800],
    'max_depth': [15, 20, None],
    'min_samples_split': [2, 5, 10],
    'min_samples_leaf': [1, 2, 4],
    'max_features': ['sqrt', 'log2', None],
    'class_weight': ['balanced', {0:1, 1:3}, {0:1, 1:5}]
}

rf = RandomForestClassifier(random_state=42, n_jobs=-1)
rf_grid = GridSearchCV(rf, rf_params, cv=5, scoring='roc_auc', n_jobs=-1)
rf_grid.fit(X_train_resampled, y_train_resampled)

best_rf = rf_grid.best_estimator_
print("Best RF params:", rf_grid.best_params_)

# XGBoost with optimized parameters
xgb_params = {
    'n_estimators': [300, 500, 800],
    'max_depth': [6, 8, 10],
    'learning_rate': [0.01, 0.05, 0.1],
    'subsample': [0.8, 0.9, 1.0],
    'colsample_bytree': [0.8, 0.9, 1.0]
}

xgb = XGBClassifier(random_state=42, use_label_encoder=False, eval_metric='logloss')
xgb_grid = GridSearchCV(xgb, xgb_params, cv=5, scoring='roc_auc', n_jobs=-1)
xgb_grid.fit(X_train_resampled, y_train_resampled)

best_xgb = xgb_grid.best_estimator_
print("Best XGB params:", xgb_grid.best_params_)

# ======================
# 8. ENSEMBLE MODEL
# ======================
# Create ensemble for better predictions
from sklearn.ensemble import VotingClassifier

ensemble = VotingClassifier(
    estimators=[
        ('rf', best_rf),
        ('xgb', best_xgb),
        ('gb', GradientBoostingClassifier(n_estimators=200, random_state=42))
    ],
    voting='soft'
)

ensemble.fit(X_train_resampled, y_train_resampled)

# ======================
# 9. ADVANCED EVALUATION
# ======================
models = {
    'Random Forest': best_rf,
    'XGBoost': best_xgb,
    'Ensemble': ensemble
}

evaluation_results = {}

for name, model in models.items():
    # Cross-validation
    cv_scores = cross_val_score(model, X_train_resampled, y_train_resampled, cv=5, scoring='roc_auc')
    
    # Test set evaluation
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]
    
    # Optimize threshold
    precision, recall, thresholds = precision_recall_curve(y_test, y_proba)
    f1_scores = 2 * (precision * recall) / (precision + recall)
    best_threshold = thresholds[np.argmax(f1_scores)]
    
    y_pred_optimized = (y_proba > best_threshold).astype(int)
    report = classification_report(y_test, y_pred_optimized, output_dict=True)
    test_auc = roc_auc_score(y_test, y_proba)
    accuracy = accuracy_score(y_test, y_pred_optimized)

    evaluation_results[name] = {
        "model": model,
        "cv_auc_mean": cv_scores.mean(),
        "cv_auc_std": cv_scores.std(),
        "test_auc": test_auc,
        "best_threshold": best_threshold,
        "accuracy": accuracy,
        "precision": report["1"]["precision"],
        "recall": report["1"]["recall"],
        "f1_score": report["1"]["f1-score"],
        "report": report,
    }
    
    print(f"\n===== {name} =====")
    print(f"CV AUC: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")
    print(f"Test AUC: {test_auc:.4f}")
    print(f"Best threshold: {best_threshold:.4f}")
    print("Accuracy:", accuracy)
    print(classification_report(y_test, y_pred_optimized))

# ======================
# 10. SELECT BEST MODEL
# ======================
# Use the model with best AUC score
best_model_name = max(evaluation_results, key=lambda model_name: evaluation_results[model_name]["test_auc"])
best_result = evaluation_results[best_model_name]
best_model = best_result["model"]
best_threshold = best_result["best_threshold"]
best_y_proba = best_model.predict_proba(X_test)[:, 1]
best_y_pred = (best_y_proba > best_threshold).astype(int)
tn, fp, fn, tp = confusion_matrix(y_test, best_y_pred).ravel()

feature_scores = np.zeros(len(selected_features))
if hasattr(best_model, "estimators_"):
    feature_models = [estimator for estimator in best_model.estimators_ if hasattr(estimator, "feature_importances_")]
    if feature_models:
        feature_scores = np.mean(
            [estimator.feature_importances_ for estimator in feature_models],
            axis=0
        )
elif hasattr(best_model, "feature_importances_"):
    feature_scores = best_model.feature_importances_

top_feature_indices = np.argsort(feature_scores)[::-1][:5]
top_features = [(selected_features[i], feature_scores[i]) for i in top_feature_indices]

print("\n===== Presenter Summary =====")
print(f"Best model: {best_model_name}")
print(f"Dataset size: {len(df)} rows")
print(f"Original features: 51")
print(f"Engineered features: {df.shape[1] - 1}")
print(f"Selected features: {len(selected_features)}")
print(f"CV AUC: {best_result['cv_auc_mean']:.4f} (+/- {best_result['cv_auc_std']:.4f})")
print(f"Test AUC: {best_result['test_auc']:.4f}")
print(f"Accuracy: {best_result['accuracy']:.4f}")
print(f"Precision (fraud class): {best_result['precision']:.4f}")
print(f"Recall (fraud class): {best_result['recall']:.4f}")
print(f"F1-score (fraud class): {best_result['f1_score']:.4f}")
print(f"Optimized threshold: {best_result['best_threshold']:.4f}")
print("\nConfusion Matrix:")
print(f"True Negatives: {tn}")
print(f"False Positives: {fp}")
print(f"False Negatives: {fn}")
print(f"True Positives: {tp}")
print("\nTop 5 Risk Features:")
for rank, (feature_name, importance) in enumerate(top_features, start=1):
    print(f"{rank}. {feature_name} ({importance:.4f})")
print("\nBusiness Summary:")
print("The model helps identify suspicious crypto transactions by ranking wallet activity patterns by fraud risk.")
print("Higher recall means fewer risky transactions are missed, while strong precision reduces false alarms for legitimate users.")

# ======================
# 11. SAVE IMPROVED MODEL
# ======================
joblib.dump(best_model, "crypto_model_improved.pkl")
joblib.dump(scaler, "scaler_improved.pkl")
joblib.dump(selector, "feature_selector_improved.pkl")

print("\n✅ Improved model saved as 'crypto_model_improved.pkl'")
print("✅ Scaler saved as 'scaler_improved.pkl'")
print("✅ Feature selector saved as 'feature_selector_improved.pkl'")

# ======================
# 12. GENERATE SAMPLE PREDICTIONS
# ======================
print("\n===== Sample Predictions =====")
sample_probs = best_model.predict_proba(X_test[:5])[:, 1]
sample_risk_scores = sample_probs * 100
sample_predictions = best_model.predict(X_test[:5])

for i in range(5):
    print(f"Sample {i+1}: Risk={sample_risk_scores[i]:.1f}%, Prediction={'Suspicious' if sample_predictions[i]==1 else 'Legitimate'}")
