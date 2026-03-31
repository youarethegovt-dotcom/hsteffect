// netlify/functions/generate-diagram.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Using the 2026 high-volume image model
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" });

    const { imageBase64, mimeType } = JSON.parse(event.body);

    const prompt = `Analyze this aerial image and recreate it as a minimalist architectural line drawing. 
      STYLE RULES:
      - Use thin charcoal lines for all building footprints and rooftop geometries.
      - Roads must be a very pale gray.
      - Railroad lines must be a pale orange/tan wash with fine parallel rail lines.
      - Apply a soft gray shadow strictly to the southwest faces of buildings for depth.
      - EXCLUSIONS: No trees, no cars, no photographic textures, and NO red colors.
      - Output: High-resolution, clean line diagram.`;

    const result = await model.generateContent([
      prompt,
      { inlineData: { data: imageBase64, mimeType } }
    ]);

    // The image model returns the generated image as a base64 string in the response
    const generatedImage = result.response.candidates[0].content.parts[0].inlineData.data;

    return {
      statusCode: 200,
      body: JSON.stringify({ image: generatedImage }),
    };
  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
};
