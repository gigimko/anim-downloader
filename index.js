const express = require("express");
const fetch = require("node-fetch");
const archiver = require("archiver");
const app = express();
const PORT = 3000;

// ✅ Hardcoded .ROBLOSECURITY cookie (must have access to target assets)
const ROBLOSECURITY_COOKIE = "_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_CAEaAhAB.7CA5EF57DAB7D75E0CF0F5746C479322C97847CF72F8043D54309141699373B2A9DB89BA31A903AA6ED739B36E4FE86C69BE5FF35F1209CC979B6BBE53B4EE071FF02A70B13B84D091E31A6375628E85AC73C90BE641E6EF5B37BB186D7CFFF0BA74C712BFD3ED99DA95BE72F9E2A174088D4AD722E03694EA3F0D4E779DC6CE0056B16EE1B94664EB52FF2B75C4ED2FC7EC0F14D15F5D697C88FAC2761D5E10936E5713339564BED67031209D0F92B46698074CD68EC23D301933CDF844D8A96B1C17339A72F889CE87BB16C1BEDC1830682630B7695830219AD688BAB3ABB2FF0CAE8BE57B7397391F2F76D5B364EFA8BFE6B9FFB4D6D64A077B8A070C5FADEB60B984A996233AE966F409FE1F83B170B5E5D42D9FDDBB83DB6C83638F88C5D89BED16C0DD7748A00535526686381B788D0E2FE8B1E1BA6717FB39C892E2D18FB91924DFEE3FA21F58C4FF01F39E6B871E335565A86F52CABF47159848AB4C07775E6D2DF838D0206C4F00A5C96432A31E40D2AE474F4BE5B329A690F832FEF0BBC3C7BB9B511BAFAD4D7FA825342B663E7475FB9D1B8A4447B1300771848B13BC8D4F0D88A6E54873F2BD7EC355EB9E32E8C920159C49671019827FCBC76E708D553A8BEBD5B27A1179CAAE47B7BDA0356861B90F6C400D61B826FE7382BD2CDDC79E9F812416D55F6DA1E80B5A883F18C4D4CE199E85B6FD1A52FBED45FBE73D859E202F488C51BD0A05EA4E678253A6BFAF3B8AA7DCB294817558AC52E799B3D88D92D47CFA211E4E917F2EE756ADB781E2ACEE46246A5578FA4BD5952E39A4A3CC48A3259B5DADC7CC318CF4A2313E21798C0E27DA49C6E41382E27F4863F517C0C1E7DB2748CBC702EC302DC1047A069DFBD5EE904FE8B44680A7320A4A0516C0C14FB3BEFF113B0B92A9E744A4E5B9657AEE65FB911A0D0AFBEAE5EF8A69C18D27956703FCFABF69C6ED5F8CED7369C87DC9F666B086C9AE9B29D710849E021B105C22C4E63235265918BD0ECA7FBEDB384D21AE7C153AF1E73CD3AF95F0942CF0FD91D643E1F9C5619B36F24AC69D631AE5346CBD888387CAE860754D859961C346A67181DBBC47F0648F64919AE5218CAE0C088E358117AB5D4D77B586A83D1DFCFEACAFF90E268D97F92068D89BF974AF55833FC852E44D06AA48F3B58C909B262E3338766C7CDFE2C8B7DCE03165FC61ED4035A3A35D5F6B657BD79B9B5490F479C8E115037B3A100946E656D21C";

app.use(express.static("public"));
app.use(express.json());

// 🔹 Get name of asset (e.g. "WalkAnim")
async function fetchAssetName(assetId) {
  try {
    const res = await fetch(`https://economy.roproxy.com/v2/assets/${assetId}/details`);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.Name?.trim() || null;
  } catch (e) {
    console.error("Failed to fetch asset name:", e);
    return null;
  }
}

// 🔹 Batch fetch asset locations
async function fetchAssetLocations(assetIds, placeId) {
  const body = assetIds.map((id, index) => ({
    assetId: id,
    assetType: "Animation",
    requestId: `${index}`,
  }));

  const res = await fetch("https://assetdelivery.roproxy.com/v2/assets/batch", {
    method: "POST",
    headers: {
      "User-Agent": "Roblox/WinInet",
      "Content-Type": "application/json",
      "Cookie": `.ROBLOSECURITY=${ROBLOSECURITY_COOKIE}`,
      "Roblox-Place-Id": placeId,
      "Accept": "*/*",
      "Roblox-Browser-Asset-Request": "false"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) return null;
  return await res.json();
}

// 🔹 API to fetch animation download links + names
app.post("/api/fetch-anims", async (req, res) => {
  const { animationIds, placeId } = req.body;
  const ids = animationIds.split(",").map(id => id.trim());

  const delivery = await fetchAssetLocations(ids, placeId);
  if (!delivery || delivery.length === 0) {
    return res.status(500).json({ error: "Failed to fetch animation locations" });
  }

  const anims = await Promise.all(delivery.map(async (item, i) => {
    const id = ids[i];
    const name = await fetchAssetName(id) || `animation_${id}`;
    const location = item.locations?.[0]?.location || null;
    return { id, name, location, downloadLink: `/api/download-anims/${id}?placeId=${placeId}` };
  }));

  const zipLink = `/api/download-zip?placeId=${placeId}&ids=${ids.join(",")}`;

  res.json({ anims, zipLink });
});

// 🔹 Download individual .rbxm file
app.get("/api/download-anims/:assetId", async (req, res) => {
  const assetId = req.params.assetId;
  const { placeId } = req.query;

  const delivery = await fetchAssetLocations([assetId], placeId);
  if (!delivery || !delivery[0]?.locations?.[0]?.location) {
    return res.status(404).send("Asset not available");
  }

  const url = delivery[0].locations[0].location;
  const name = await fetchAssetName(assetId) || `animation_${assetId}`;

  try {
    const fileRes = await fetch(url);
    if (!fileRes.ok) return res.status(500).send("Failed to download");

    res.setHeader("Content-Disposition", `attachment; filename="${name}.rbxm"`);
    res.setHeader("Content-Type", "application/octet-stream");
    fileRes.body.pipe(res);
  } catch (e) {
    console.error("Download error:", e);
    res.status(500).send("Stream error");
  }
});

// 🔹 Download ZIP of all animations
app.get("/api/download-zip", async (req, res) => {
  const { placeId, ids } = req.query;
  const assetIds = ids.split(",").map(id => id.trim());

  const delivery = await fetchAssetLocations(assetIds, placeId);
  if (!delivery || delivery.length === 0) {
    return res.status(500).send("Asset delivery failed");
  }

  res.setHeader("Content-Disposition", `attachment; filename="animations.zip"`);
  res.setHeader("Content-Type", "application/zip");

  const archive = archiver("zip");
  archive.pipe(res);

  for (let i = 0; i < delivery.length; i++) {
    const loc = delivery[i]?.locations?.[0]?.location;
    if (!loc) continue;

    const assetId = assetIds[i];
    const name = await fetchAssetName(assetId) || `animation_${assetId}`;

    try {
      const fileRes = await fetch(loc);
      if (fileRes.ok) {
        archive.append(fileRes.body, { name: `${name}.rbxm` });
      }
    } catch (e) {
      console.warn(`Failed to fetch asset ${assetId}`);
    }
  }

  archive.finalize();
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
