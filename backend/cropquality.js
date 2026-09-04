const express = require("express");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { crop_name, image } = req.body;

    if (!crop_name || !image) {
      return res.status(400).json({
        message: "Crop name and image are required"
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        message: "GEMINI_API_KEY is not configured"
      });
    }

    // Extract MIME type and Base64 data from the data URL
    let mimeType = "image/jpeg";
    let base64Image = image;

    if (image.startsWith("data:")) {
      const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);

      if (!match) {
        return res.status(400).json({
          message: "Invalid image format"
        });
      }

      mimeType = match[1];
      base64Image = match[2];
    }

    const model =
      process.env.GEMINI_VISION_MODEL || "gemini-3.7-flash";

    const prompt = `
Analyze this crop image for the crop: ${crop_name}.

Return ONLY valid JSON in this exact structure:

{
  "grade": "A",
  "score": 85,
  "summary": "short description",
  "issues": ["issue 1", "issue 2"]
}

Rules:
- Judge only what is visibly supported by the image.
- Do not invent diseases, damage or defects.
- Do not claim a disease unless there are visible signs that support it.
- If the image is unclear, lower the score and mention that image quality limits the assessment.
- Grade must be A, B, C, or D.
- Score must be between 0 and 100.
- Keep the summary short.
- If there are no visible issues, return an empty issues array.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Image
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", data);

      return res.status(response.status).json({
        message: "AI crop analysis failed",
        error: data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        message: "AI returned no analysis"
      });
    }

    // Remove markdown code fences if Gemini adds them
    const cleanText = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let result;

    try {
      result = JSON.parse(cleanText);
    } catch (error) {
      console.error("Gemini returned invalid JSON:", text);

      return res.status(500).json({
        message: "AI returned invalid JSON",
        raw: text
      });
    }

    res.json(result);

  } catch (error) {
    console.error("Crop quality error:", error);

    res.status(500).json({
      message: "Failed to analyze crop quality",
      error: error.message
    });
  }
});

module.exports = router;