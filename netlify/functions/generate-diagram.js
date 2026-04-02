const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp");

exports.handler = async (event) => {
  console.log("--- EXECUTING SITE DIAGRAM: VERSION 3.2 ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel(
      { model: "gemini-3.1-flash-image-preview" },
      { apiVersion: "v1beta" }
    );

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const defaultStyle = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, not overly detailed, no text.";

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a high-quality site diagram.
      - STYLE: ${customInstructions || defaultStyle}
      - TECHNICAL: Pure white background, high contrast lines, no photographic textures.`;

    // 1. Ask Gemini to generate the diagram
    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const part = response.candidates[0].content.parts.find(p => p.inlineData);

    // GUARD RAIL: If the AI returns text instead of an image (usually a safety trigger)
    if (!part || !part.inlineData) {
      throw new Error("AI_NO_IMAGE");
    }

    const aiBuffer = Buffer.from(part.inlineData.data, 'base64');
    
    // 2. High-Performance Resize back to your 1897px (or original) width
    const resizedBuffer = await sharp(aiBuffer)
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // 3. Vectorize the high-res result
    const svgData = await new Promise((resolve, reject) => {
      potrace.trace(resizedBuffer, { threshold: 128, turdSize: 2 }, (err, svg) => {
        if (err) reject(err);
        resolve(svg);
      });
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: resizedBuffer.toString('base64'), 
        svg: Buffer.from(svgData).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("DIAGNOSTIC:", error.message);
    
    let userMessage = "The engine timed out. Try a smaller screenshot.";
    if (error.message === "AI_NO_IMAGE") userMessage = "The AI refused to draw this site (Safety Trigger). Try zooming in or out slightly.";

    return {
      statusCode: 500,
      body: JSON.stringify({ error: userMessage }),
    };
  }
};
