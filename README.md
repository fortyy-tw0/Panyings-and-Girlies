# SikLo

**Your cycle. Your device. Your data.**

*A hackathon project by Panyings-and-Girlies.*

SikLo, from the Filipino word *siklo* meaning "cycle," is a menstrual wellness app being built around private, offline-first tracking and an on-device AI companion. It brings together a place to record what you notice, understand your cycle history, and ask questions in your own words.

Cycle tracking should leave room for uncertainty. You may have irregular periods, missing dates, or days when you only want to write a note. SikLo is designed to meet you where you are, without requiring an online account or every detail of your health history.

## The experience we're building

- **Track at your own pace.** Record period dates, spotting, flow, cramps, mood, sleep, energy, and personal notes. Optional questions can be skipped, and an unknown date stays unknown.
- **See records and estimates clearly.** Today, Calendar, and Insights are designed to distinguish what you logged from what the app estimates, with plain-language explanations of the history behind each prediction.
- **Have room to talk.** The companion is intended for questions, reflection, and venting. You might ask, "What did I log this cycle?" or "How has my recorded cycle length changed?" Personal records should be used only with your permission.
- **Learn without judgment.** An offline educational library is part of the planned experience, with understandable answers and visible sources. Educational content remains a draft pending clinical review.
- **Choose what stays.** The design includes conversation-retention choices, selected-record exports, manual encrypted backups, and separate controls for deleting chats or personal records.

The UI/UX direction uses a calm cream-and-purple palette, clear labels, and optional setup steps. English, Filipino, and mixed-language preferences are planned; language quality and accessibility still need testing.

## How cycle estimates work

SikLo's backend uses rule-based calculations, separate from the AI model. The current engine requires at least three valid, completed start-to-start intervals before producing a next-period estimate. With less history, it returns "not enough information" instead of assuming a cycle length.

It uses the median of recent qualifying cycle lengths for the estimated date and the shortest-to-longest range for an estimated window. These are prototype heuristics, not clinically validated forecasts. The companion is intended to explain the engine's results rather than generate its own dates.

## Privacy is part of the design

Our intended architecture keeps personal records and AI processing on the device, with no cloud account, cloud AI inference, or training uploads. Initial model installation and optional updates may require an internet connection.

The backend already contains code for consent by conversation and data type, chat retention, field-level encryption, export, backup, restore, and deletion. The UI design also calls for selecting the dates and record types a conversation may use. These components still need to be connected and verified together; their presence is not a security audit or a guarantee that the current mobile prototype provides every protection.

Copies you choose to export or back up are separate from the app's records. Deleting data in the app does not remove copies saved elsewhere.

## Current development

| Area | Where to look | Current scope |
| --- | --- | --- |
| Frontend | [`frontend`](https://github.com/fortyy-tw0/Panyings-and-Girlies/tree/frontend) | Onboarding screens, local-profile storage, and the visual foundation. |
| App and AI work | [`feat/pushy-app`](https://github.com/fortyy-tw0/Panyings-and-Girlies/tree/feat/pushy-app) | Expo/React Native app work and local-model integration code. |
| Backend | [`feat/pushy-backend`](https://github.com/fortyy-tw0/Panyings-and-Girlies/tree/feat/pushy-backend) | Python/FastAPI reference implementation and a TypeScript core intended for on-device use, including records, predictions, reminders, and privacy controls. |

The app branch currently includes a connection to a development backend running on a computer. Moving that flow fully onto the phone, completing mobile storage and encryption integration, and testing the companion are ongoing work. See the branch-specific documentation for setup details; `main` currently serves as the project overview.

The immediate focus is connecting logging, predictions, consent, and the companion into one working experience. Broader contraception support and a dedicated pregnancy mode remain future directions, not completed features.

## Health boundaries

SikLo is a wellness prototype, not a medical device or a substitute for professional care. It does not diagnose conditions, confirm ovulation, identify contraceptive "safe days," or guarantee period dates. Estimates may be less useful with irregular or incomplete histories. The AI can make mistakes, and educational information does not replace medical or prenatal advice.

## Why does SikLo benefit from running AI locally?

Menstrual records and personal conversations are sensitive. An on-device companion is intended to help people understand selected records without sending them to a cloud AI provider. Keeping that processing local supports the privacy and control at the heart of SikLo.

After the model and required resources are installed, local AI can also make the companion useful without a reliable internet connection or a cloud inference request for every conversation. This matters for a tool people may want to use privately, wherever they are. These are the benefits we are building toward; the complete mobile experience still needs integration and offline testing.

## Hackathon disclosures

The following describes the development code reviewed for this README. A configured feature or dependency is not proof that it ran successfully in the submitted demo. 

### Models

- **Configured companion model:** Qwen3.5-2B in GGUF format, using Q4_K_M quantization. The app's model manager selects this model and points to the `unsloth/Qwen3.5-2B-GGUF` repository on Hugging Face for its download.
- **Intended inference runtime:** `llama.rn`. Integration code is present, but the reviewed app package manifest does not yet list this dependency. Successful installation and inference on the demo device are not verified here.
- **Unused configuration:** a Qwen3.5-4B option appears in the code with a placeholder download URL. It is not selected by the current model-selection function and is not claimed as a demonstrated model.
- **Team confirmation needed:** the exact model file/revision, applicable model license, demo device, and whether that model actually ran during the demonstration. Cycle-date estimates come from the rule-based engine, not the language model.

### Technologies and frameworks

| Component | Technologies present or referenced in development |
| --- | --- |
| Mobile interface | React Native, React, Expo, Expo Router, and TypeScript. |
| Profile and interface support | Expo SecureStore, React Native SVG, and Plus Jakarta Sans through `@expo-google-fonts/plus-jakarta-sans`. |
| Local AI integration | `llama.rn` and Expo FileSystem calls in the model-loading code; mobile integration remains in progress. |
| On-device core in development | TypeScript and SQLite, with a React Native adapter targeting `@op-engineering/op-sqlite`. Mobile compatibility and encryption integration still need verification. |
| Reference backend | Python, FastAPI, Uvicorn, and the `cryptography` package. |

### APIs, cloud services, and connectivity

- **Current development API:** the app branch includes HTTP requests to the Python/FastAPI backend running on a development computer. A physical phone needs a reachable connection to that computer, typically over the same local network. This is not yet a fully self-contained phone deployment.
- **Model distribution:** the configured model download uses Hugging Face and requires internet access. Downloading model weights is separate from sending conversations to a hosted inference API.
- **Intended local operation:** model inference, personal-record storage, and cycle calculations are intended to run on the phone after setup. The TypeScript core is being developed for direct app calls without a separate HTTP server.
- **Other internet use:** installing dependencies, downloading optional updates, and opening external source links may require internet access.
- **Team confirmation needed:** list any additional hosted APIs, cloud services, analytics, or remote inference used in the actual demo, or explicitly confirm that none were used. Document which features were successfully tested offline and which still relied on the development computer.

### Existing code and assets

The app branch identifies an Expo `create-expo-app` starting point and contains Expo/React starter assets. The project also uses third-party libraries, pretrained model weights, and the Plus Jakarta Sans font. These are reused foundations, not original work created entirely by the team during the hackathon.

### AI development tools

**OpenAI Codex** assisted with reviewing repository files and the supplied UI/UX reference, drafting this README, and organizing the submission disclosures. This documents development assistance, separate from SikLo's intended on-device companion.

**Claude:**  used for coding, debugging, research, writing, or design, and briefly describe their contributions. This README does not claim Codex was the team's only AI development tool.
