INSERT INTO "site_content_revisions" (
  "page_key",
  "revision",
  "status",
  "content",
  "created_by",
  "published_by",
  "published_at"
)
SELECT
  'widget-exchange-information',
  1,
  'published',
  $content${
    "visible": true,
    "showIcon": true,
    "glow": true,
    "title": "Exchange Information",
    "text": "Exchanges are processed automatically with AML verification. The exchange rate is based on real-time spot market data and is floating, meaning it is calculated at the moment of processing according to current market conditions. The transaction requires network confirmations depending on the cryptocurrency and network. After the required confirmations are received, processing begins and may take up to 10 additional minutes. The final amount may vary depending on market fluctuations.",
    "textSize": "small",
    "textAlign": "left"
  }$content$::jsonb,
  'system',
  'system',
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM "site_content_revisions"
  WHERE "page_key" = 'widget-exchange-information'
);
-- Custom SQL migration file, put your code below! --