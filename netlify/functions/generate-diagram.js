const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");
const sharp = require("sharp"); // The new resizing engine

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel(
      { model: "gemini-3.1-flash-image-preview" },
      { apiVersion: "v1beta" }
    );

    // We now accept 'width' and 'height' from the frontend
    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const defaultStyle = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, not overly detailed, no text.";

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      TASK: Convert this aerial photo into a high-quality site diagram.
      STYLE: ${customInstructions || defaultStyle}
      TECHNICAL: High contrast, clean boundaries, no trees/cars.`;

    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const pngBase64 = response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;

    // --- NEW: RESIZE TO ORIGINAL DIMENSIONS ---
    console.log(`Upscaling to match original: ${width}x${height}`);
    const aiBuffer = Buffer.from(pngBase64, 'base64');
    
    // We resize the AI output back to your original upload size
    const resizedBuffer = await sharp(aiBuffer)
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // Now vectorize the full-res version
    const svgData = await new Promise((resolve, reject) => {
      potrace.trace(resizedBuffer, { threshold: 128 }, (err, svg) => {
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
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
