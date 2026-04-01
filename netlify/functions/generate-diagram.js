const { GoogleGenerativeAI } = require("@google/generative-ai");
const potrace = require("potrace");

exports.handler = async (event) => {
  console.log("--- STARTING VECTOR ENGINE ---");

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel(
      { model: "gemini-3.1-flash-image-preview" },
      { apiVersion: "v1beta" }
    );

    const { imageBase64, mimeType } = JSON.parse(event.body);

    const prompt = `ACT AS AN ARCHITECTURAL ILLUSTRATOR. 
      Convert this aerial photo into a high-contrast minimalist site diagram.
      - Use BOLD charcoal outlines for buildings.
      - Use solid gray for roads.
      - Use a distinct hatch/wash for the railroad.
      - IMPORTANT: High contrast between lines and background to assist vectorization.`;

    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType } },
      { text: prompt }
    ]);

    const response = await result.response;
    const imagePart = response.candidates[0].content.parts.find(p => p.inlineData);
    const pngBase64 = imagePart.inlineData.data;

    // --- NEW: VECTORIZATION LOGIC ---
    console.log("Vectorizing image...");
    const imgBuffer = Buffer.from(pngBase64, 'base64');
    
    const svgData = await new Promise((resolve, reject) => {
      // Potrace works best on high-contrast architectural lines
      potrace.trace(imgBuffer, { threshold: 128 }, (err, svg) => {
        if (err) reject(err);
        resolve(svg);
      });
    });

    console.log("SVG Success.");

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        image: pngBase64, 
        svg: Buffer.from(svgData).toString('base64') 
      }),
    };

  } catch (error) {
    console.error("VECTOR ERROR:", error.message);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
