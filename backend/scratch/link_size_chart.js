const fs = require('fs');
const path = require('path');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const imagePath = '/Users/umairrasheed/.gemini/antigravity-ide/brain/bb9f1f52-c957-461b-ae18-181a8f4f88b1/trace_size_chart_white_1781547870564.png';

async function shopifyGql(query, variables = {}) {
  const res = await fetch(`https://${shopDomain}/admin/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  return res.json();
}

async function getSemiFormalProducts() {
  const query = `
    query {
      collections(first: 50) {
        edges {
          node {
            id
            title
            handle
            products(first: 50) {
              edges {
                node {
                  id
                  title
                }
              }
            }
          }
        }
      }
    }
  `;
  const res = await shopifyGql(query);
  const collections = res.data.collections.edges.map(e => e.node);
  const semiFormal = collections.find(c => c.title.toLowerCase().includes('semi formal') || c.handle.toLowerCase().includes('semi-formal'));
  if (!semiFormal) {
    console.log("Could not find collection containing 'Semi Formal' in title or handle.");
    console.log("Available collections are:");
    collections.forEach(c => console.log(`- ${c.title} (handle: ${c.handle})`));
    return null;
  }
  console.log(`Found collection: "${semiFormal.title}"`);
  return semiFormal.products.edges.map(e => e.node);
}

// Staged upload to Shopify S3 and create File
async function uploadImage() {
  console.log("Staging upload on Shopify...");
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
    console.error("Staged upload creation failed:", JSON.stringify(stageRes, null, 2));
    return null;
  }

  const target = stageRes.data.stagedUploadsCreate.stagedTargets[0];
  console.log("Uploading file to Shopify S3 storage...");

  // Read file data
  const fileBuffer = fs.readFileSync(imagePath);

  // Build multipart form data
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  const blob = new Blob([fileBuffer], { type: 'image/png' });
  formData.append('file', blob, filename);

  const uploadRes = await fetch(target.url, {
    method: 'POST',
    body: formData
  });

  if (!uploadRes.ok) {
    console.error("Failed to upload file to S3. Status:", uploadRes.status);
    return null;
  }
  console.log("File uploaded to S3. Registering file in Shopify...");

  const fileCreateMutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          createdAt
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
        alt: "TRACE Size Chart",
        contentType: "IMAGE",
        originalSource: target.resourceUrl
      }
    ]
  });

  if (fileCreateRes.errors || fileCreateRes.data.fileCreate.userErrors.length > 0) {
    console.error("File registration failed:", JSON.stringify(fileCreateRes, null, 2));
    return null;
  }

  const fileId = fileCreateRes.data.fileCreate.files[0].id;
  console.log(`File registered with ID: ${fileId}. Waiting for processing...`);

  // Poll until the file is ready
  const fileQuery = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on GenericFile {
          status
        }
        ... on MediaImage {
          status
        }
      }
    }
  `;

  for (let i = 0; i < 15; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const fileStatusRes = await shopifyGql(fileQuery, { id: fileId });
    const status = fileStatusRes.data.node?.status;
    console.log(`Polling status: ${status}`);
    if (status === 'READY' || status === 'ready' || status === 'UPLOADED') {
      console.log("File is ready!");
      return fileId;
    }
    if (status === 'FAILED' || status === 'failed') {
      console.error("File processing failed on Shopify side.");
      return null;
    }
  }
  console.warn("Polling timed out, returning file ID anyway.");
  return fileId;
}

async function updateProductMetafields(products, fileId) {
  const mutation = `
    mutation updateProductMetafield($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  for (const product of products) {
    console.log(`Updating metafield for product: "${product.title}"...`);
    const vars = {
      input: {
        id: product.id,
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
    const res = await shopifyGql(mutation, vars);
    if (res.errors || res.data.productUpdate.userErrors.length > 0) {
      console.error(`Failed to update metafield for ${product.title}:`, JSON.stringify(res, null, 2));
    } else {
      console.log(`✅ Successfully updated ${product.title}!`);
    }
  }
}

async function run() {
  const products = await getSemiFormalProducts();
  if (!products || products.length === 0) {
    console.log("No products found to update.");
    return;
  }

  const fileId = await uploadImage();
  if (!fileId) {
    console.error("Failed to upload or register the size chart image.");
    return;
  }

  await updateProductMetafields(products, fileId);
  console.log("Finished linking size chart!");
}

run();
