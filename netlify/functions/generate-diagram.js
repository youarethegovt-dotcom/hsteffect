const { GoogleGenerativeAI } = require("@google/generative-ai");
const ImageTracer = require("imagetracerjs");
const sharp = require("sharp");

exports.handler = async (event) => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" }, { apiVersion: "v1beta" });

    const { imageBase64, mimeType, customInstructions, width, height } = JSON.parse(event.body);

    const defaultStyle = ".25mm dark charcoal outline around all buildings, .1mm thin gray lines for all of the building forms, roads to be a lighter gray tone, water represented with pale light blue, white masses for buildings with gray shade for the sides of the buildings in shadow, not overly detailed, no text.";

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      STYLE: ${customInstructions || defaultStyle}
      TECHNICAL: High-quality site diagram, clean solid color fills, no gradients.`;

    const result = await model.generateContent([{ inlineData: { data: imageBase64, mimeType } }, { text: prompt }]);
    const pngBase64 = result.response.candidates[0].content.parts.find(p => p.inlineData).inlineData.data;

    // 1. High-res Resize
    const aiBuffer = await sharp(Buffer.from(pngBase64, 'base64'))
      .resize(parseInt(width), parseInt(height), { fit: 'fill' })
      .toBuffer();

    // 2. COLOR VECTORIZATION
    // This creates an SVG where colors are separate shapes
    const svgData = ImageTracer.bufferToSVG(aiBuffer, {
        ltres: 0.5, // Line threshold (lower is sharper)
        qtres: 0.5, // Spline threshold
        numberofcolors: 8, // Limits the palette for cleaner Illustrator layers
        mincolorratio: 0.01,
        strokewidth: 0.5
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: aiBuffer.toString('base64'), 
        svg: Buffer.from(svgData).toString('base64') 
      }),
    };

  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
