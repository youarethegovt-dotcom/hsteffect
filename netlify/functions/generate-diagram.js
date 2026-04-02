const { GoogleGenerativeAI } = require("@google/generative-ai");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING STABILITY MASTER: V5.4 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions } = JSON.parse(event.body);

    const firmStandard = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, not overly detailed, no text.";

    const prompt = `ACT AS A SENIOR ARCHITECTURAL ILLUSTRATOR.
      Convert this aerial map into a site diagram.
      INSTRUCTIONS: ${customInstructions || firmStandard}
      TECHNICAL REQUIREMENT: Explicitly render 3D depth with gray shading on building sides. High contrast. Pure white background. No text.`;

    // 1. AI Generation
    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;
    const aiBuffer = Buffer.from(pngBase64, 'base64');

    // 2. THE STABILITY TWEAK: 2500px + Indexed Compression
    // 2500px is the "Sweet Spot" that stays under the 6MB payload limit every time.
    const masterPng = await sharp(aiBuffer)
        .resize({ width: 2500 })
        .sharpen({ sigma: 1.0 }) // Crisp but not "noisy"
        .png({ 
            palette: true,      // Crucial for reducing file size
            compressionLevel: 9, 
            quality: 85 
        })
        .toBuffer();

    console.log(`Stability Master Created: ${Math.round(masterPng.length / 1024)}KB`);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: masterPng.toString('base64') }),
    };

  } catch (error) {
    console.error("CRITICAL ERROR:", error.message);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: "Stability Error: " + error.message }) 
    };
  }
};
