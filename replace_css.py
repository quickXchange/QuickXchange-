import re

with open("artifacts/crypto-exchange-widget/src/index.css", "r") as f:
    content = f.read()

# We need to find the start of `.oc-container {` or similar
# Let's search for `.oc-container {`
start_idx = content.find(".oc-container {")
if start_idx == -1:
    print("Could not find start of .oc- CSS")
else:
    # We want to replace from here until the end of the file, assuming it's at the end.
    # Let's see if there is any non-oc CSS at the end.
    pass

