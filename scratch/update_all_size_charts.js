const fs = require('fs');
const path = require('path');
const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';

const productsConfig = [
  {
    id: 8629309505795,
    title: 'Basic RL Crew- Cotton',
    imageFileName: 'rl_crew_size_chart_ideal.png',
    cleanDescription: '<p>This Basic RL Crew is made with a blend of cotton and jersey fabric that undergoes high-quality dying and finishing processes.</p>'
  },
  {
    id: 8296437547267,
    title: 'ADI-Trouser Tri strip',
    imageFileName: 'adi_trouser_size_chart.png',
    cleanDescription: '<p><strong>Fabric:</strong><br>Micro dry-fit, 2-way stretchable (left and right) for enhanced flexibility and comfort.</p>\n<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in summer.</p>\n<p><strong>Design Features:</strong></p>\n<ul>\n<li>Three sleek lines for a modern, dynamic look.</li>\n<li>Athletic slim fit for a tailored, performance-ready style.</li>\n</ul>'
  },
  {
    id: 8297865478403,
    title: 'Embossed NIK-E',
    imageFileName: 'nik_embossed_size_chart.png',
    cleanDescription: '<p><strong>Fabric:</strong><br>Micro dry-fit, 2-way stretchable (left &amp; right) for enhanced flexibility and comfort.</p>\n<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in summer.</p>\n<p><strong>Design Features:</strong></p>\n<ul>\n<li>Snap reflector Embossed logo.</li>\n<li>Brand tagging.</li>\n</ul>'
  },
  {
    id: 9224595276035,
    title: 'Multi-ref-ADI Trouser winter',
    imageFileName: 'adi_winter_trouser_size_chart.png',
    cleanDescription: '<p><strong>Fabric:</strong><br>Micro dry-fit Fleece, 2-way stretchable (left and right) for enhanced flexibility and comfort.</p>\n<p><strong>Ideal Use:</strong><br>Perfect for activewear and athletic activities in winter.</p>\n<p><strong>Design Features:</strong></p>\n<ul>\n<li>Three sleek lines for a modern, dynamic look.</li>\n<li>Athletic slim fit for a tailored, performance-ready style.</li>\n</ul>'
  },
  {
    id: 8894057382147,
    title: 'Popcorn Polo',
    imageFileName: 'popcorn_polo_size_chart.png',
    cleanDescription: '<p><strong>Fabric:</strong> Premium Blend Cotton with Popcorn Texture (Approx. 220 GSM)</p>\n<p>(<em>Price is set to maintain quality standards.</em>)</p>\n<p><strong>Ideal Use:</strong> Textured design for a sleek and refined look.</p>'
  }
];

async function shopifyGql(query, variables = {}) {
  const res = await axios.post(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
    query,
    variables
  }, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  });
  return res.data;
}

async function uploadImage(imagePath, title) {
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Image file does not exist: ${imagePath}`);
    return null;
  }

  console.log(`Staging upload for "${title}" size chart...`);
  const stageMutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const filename = path.basename(imagePath);
  const vars = {
    input: [
      {
        resource: "FILE",
        filename: filename,
        mimeType: "image/png",
        httpMethod: "POST"
      }
    ]
  };

  const stageRes = await shopifyGql(stageMutation, vars);
  if (stageRes.errors || stageRes.data.stagedUploadsCreate.userErrors.length > 0) {
    console.error(`❌ Staged upload failed for ${title}:`, JSON.stringify(stageRes, null, 2));
    return null;
  }

  const target = stageRes.data.stagedUploadsCreate.stagedTargets[0];
  console.log(`Uploading file ${filename} to Shopify storage...`);

  const fileBuffer = fs.readFileSync(imagePath);
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  const blob = new Blob([fileBuffer], { type: 'image/png' });
  formData.append('file', blob, filename);

  try {
    await axios.post(target.url, formData);
    console.log("File uploaded successfully to S3/GCS.");
  } catch (err) {
    console.error(`❌ S3 upload failed for ${title}:`, err.message);
    if (err.response) {
      console.error("S3 Error Response:", err.response.data);
    }
    return null;
  }

  console.log(`Registering size chart file for "${title}" in Shopify...`);
  const fileCreateMutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const fileCreateRes = await shopifyGql(fileCreateMutation, {
    files: [
      {
        alt: `${title} Size Chart`,
        contentType: "IMAGE",
        originalSource: target.resourceUrl
      }
    ]
  });

  if (fileCreateRes.errors || fileCreateRes.data.fileCreate.userErrors.length > 0) {
    console.error(`❌ File registration failed for ${title}:`, JSON.stringify(fileCreateRes, null, 2));
    return null;
  }

  const fileId = fileCreateRes.data.fileCreate.files[0].id;
  console.log(`File registered with ID: ${fileId}. Waiting for readiness...`);

  const fileQuery = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on GenericFile { status }
        ... on MediaImage { status }
      }
    }
  `;

  for (let i = 0; i < 15; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const fileStatusRes = await shopifyGql(fileQuery, { id: fileId });
    const status = fileStatusRes.data.node?.status;
    console.log(`Polling status for "${title}": ${status}`);
    if (status === 'READY' || status === 'ready' || status === 'UPLOADED') {
      console.log("File is ready!");
      return fileId;
    }
  }

  return fileId;
}

async function updateProduct(productId, fileId, cleanDescription, title) {
  // 1. Update metafield size_chart
  const mutation = `
    mutation updateProductMetafield($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id }
        userErrors { field message }
      }
    }
  `;

  const vars = {
    input: {
      id: `gid://shopify/Product/${productId}`,
      metafields: [
        {
          namespace: "custom",
          key: "size_chart",
          value: fileId,
          type: "file_reference"
        }
      ]
    }
  };

  console.log(`Linking size chart metafield for "${title}"...`);
  const metafieldRes = await shopifyGql(mutation, vars);
  if (metafieldRes.errors || metafieldRes.data.productUpdate.userErrors.length > 0) {
    console.error(`❌ Failed to update metafield for ${title}:`, JSON.stringify(metafieldRes, null, 2));
  } else {
    console.log(`✅ Linked size chart image in metafield.`);
  }

  // 2. Update description (body_html)
  console.log(`Removing size chart table from description for "${title}"...`);
  const restUrl = `https://${shopDomain}/admin/api/2024-10/products/${productId}.json`;
  try {
    const res = await axios.put(restUrl, {
      product: {
        id: productId,
        body_html: cleanDescription
      }
    }, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    if (res.status === 200) {
      console.log(`✅ Cleaned description for "${title}" successfully!`);
    }
  } catch (err) {
    console.error(`❌ Failed to update description for "${title}":`, err.response ? err.response.data : err.message);
  }
}

async function main() {
  console.log("🚀 Starting processing for all 5 products...\n");
  for (const prod of productsConfig) {
    const absoluteImagePath = path.join('/Users/umairrasheed/Desktop/antigravity/trace-erp/scratch', prod.imageFileName);
    console.log(`--------------------------------------------------`);
    console.log(`Processing Product: "${prod.title}" (ID: ${prod.id})`);
    console.log(`--------------------------------------------------`);

    const fileId = await uploadImage(absoluteImagePath, prod.title);
    if (fileId) {
      await updateProduct(prod.id, fileId, prod.cleanDescription, prod.title);
    } else {
      console.error(`❌ Skipping "${prod.title}" updates due to image upload failure.`);
    }
    console.log(`Done processing "${prod.title}".\n`);
    // Rate limit delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log("🏁 All 5 products processed!");
}

main();
