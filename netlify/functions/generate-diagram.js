const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING NASHVILLE STANDARD ENGINE: V5.1 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width } = JSON.parse(event.body);

    // YOUR FIRM STANDARD PROMPT
    const firmStandard = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, not overly detailed, no text.";

    const prompt = `ACT AS A TECHNICAL ARCHITECTURAL ILLUSTRATOR.
      TASK: Convert this aerial into a high-definition site diagram.
      STYLE: ${customInstructions || firmStandard}
      TECHNICAL: Pure white background. High contrast. Render 3D depth with shading on building sides as requested.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 3500px Master Upscale with Professional Sharpening
    const finalWidth = 3500;
    const masterPng = await sharp(aiBuffer)
        .resize({ width: finalWidth })
        .sharpen({ sigma: 1.2, m1: 0.5, m2: 20 })
        .png({ palette: true, quality: 100 })
        .toBuffer();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: masterPng.toString('base64') }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
