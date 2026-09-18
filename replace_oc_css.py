import re

with open("artifacts/crypto-exchange-widget/src/index.css", "r") as f:
    content = f.read()

start_marker = "/* --- ORDER CONFIRMATION REDESIGN --- */\n@import './order-confirmation.css';\n\n"
start_idx = content.find(start_marker)

if start_idx == -1:
    print("Could not find start marker")
    exit(1)

with open("artifacts/crypto-exchange-widget/src/order-confirmation.css", "r") as f:
    oc_css = f.read()

new_content = content[:start_idx] + "/* --- ORDER CONFIRMATION REDESIGN --- */\n" + oc_css + "\n" + content[start_idx + len(start_marker):]

with open("artifacts/crypto-exchange-widget/src/index.css", "w") as f:
    f.write(new_content)

print("Inlined successfully")
