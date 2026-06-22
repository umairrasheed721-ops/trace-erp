const fs = require('fs');
const path = require('path');
const axios = require('axios');

const shopDomain = '041839-3.myshopify.com';
const accessToken = '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';
const imagePath = '/Users/umairrasheed/Desktop/antigravity/trace-erp/scratch/rl_crew_size_chart_ideal.png';
const productId = 8629309505795; // Basic RL Crew- Cotton

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

async function uploadImage() {
  console.log("Staging upload on Shopify via GraphQL...");
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
  console.log("Uploading file to Shopify S3 storage using Axios...");

  const fileBuffer = fs.readFileSync(imagePath);
  const formData = new FormData();
  for (const param of target.parameters) {
    formData.append(param.name, param.value);
  }
  const blob = new Blob([fileBuffer], { type: 'image/png' });
  formData.append('file', blob, filename);

  try {
    const uploadRes = await axios.post(target.url, formData);
    console.log("File uploaded successfully to S3.");
  } catch (err) {
    console.error("Failed to upload file to S3:", err.message);
    if (err.response) {
      console.error("S3 Response Data:", err.response.data);
    }
    return null;
  }

  console.log("Registering file in Shopify...");
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
        alt: "Basic RL Crew Size Chart",
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
  console.log(`File registered with ID: ${fileId}. Polling status...`);

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
      console.log("File is ready on Shopify CDN!");
      return fileId;
    }
  }

  return fileId;
}

async function updateProductMetafieldAndDescription(fileId) {
  // Update metafield size_chart
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

  console.log("Linking size chart image to product metafield...");
  const metafieldRes = await shopifyGql(mutation, vars);
  if (metafieldRes.errors || metafieldRes.data.productUpdate.userErrors.length > 0) {
    console.error("Failed to update metafield:", JSON.stringify(metafieldRes, null, 2));
  } else {
    console.log("✅ Successfully updated size_chart metafield!");
  }

  // Update description to remove table
  console.log("Updating product description (removing size chart table)...");
  const cleanDescription = "<p>This Basic RL Crew is made with a blend of cotton and jersey fabric that undergoes high-quality dying and finishing processes.</p>";
  
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
      console.log("✅ Successfully removed table from description!");
    }
  } catch (err) {
    console.error("Failed to update description:", err.response ? err.response.data : err.message);
  }
}

async function run() {
  const fileId = await uploadImage();
  if (!fileId) {
    console.error("File upload failed.");
    return;
  }
  await updateProductMetafieldAndDescription(fileId);
  console.log("Finished all updates!");
}

run();
