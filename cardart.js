// Card artwork: the designed front and back images, with the member's details drawn on the front.
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const cardImages = Promise.all([loadImage("card-front.jpg"), loadImage("card-back.jpg")]);

const cardDate = (date) => date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });

function canvasFrom(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  return canvas;
}

async function drawCardBack() {
  const [, back] = await cardImages;
  return canvasFrom(back);
}

async function drawCardFace(profile) {
  const [front] = await cardImages;
  const canvas = canvasFrom(front);
  const ctx = canvas.getContext("2d");

  const since = new Date(profile.created_at ?? Date.now());
  const validThru = new Date(since);
  validThru.setFullYear(validThru.getFullYear() + 3); // cards are valid for 3 years

  ctx.fillStyle = "#0d2a5c";
  ctx.font = "600 52px 'Segoe UI', sans-serif";
  ctx.fillText(profile.display_name.toUpperCase(), 100, 618, 800); // 800 = max width for long names
  ctx.font = "bold 40px 'Segoe UI', sans-serif";
  ctx.fillText(cardDate(since), 273, 993);
  ctx.fillText(cardDate(validThru), 648, 993);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 62px 'Courier New', monospace";
  ctx.fillText(`AF-${since.getFullYear()}-${profile.qr_token.slice(0, 4).toUpperCase()}`, 195, 820);

  const holder = document.createElement("div"); // the QR holds only the random card ID
  new QRCode(holder, { text: profile.qr_token, width: 280, height: 280 });
  ctx.drawImage(holder.querySelector("canvas"), 1229, 470, 280, 280);
  return canvas;
}
