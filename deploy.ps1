# deploy.ps1
Write-Host "Starting deployment..."

# Set AWS credentials
$env:AWS_ACCESS_KEY_ID = "your-access-key-id"
$env:AWS_SECRET_ACCESS_KEY = "your-secret-access-key"
$env:AWS_DEFAULT_REGION = "your-region"

# Function to check if resource exists
function Test-ResourceExists {
    param (
        [string]$resourceType,
        [string]$resourceName
    )
    
    try {
        switch ($resourceType) {
            "s3" { aws s3api head-bucket --bucket $resourceName 2>&1 | Out-Null }
            "dynamodb" { aws dynamodb describe-table --table-name $resourceName 2>&1 | Out-Null }
        }
        return $true
    }
    catch {
        return $false
    }
}

# Create S3 bucket if it doesn't exist
if (-not (Test-ResourceExists -resourceType "s3" -resourceName "culinary-compass-app")) {
    Write-Host "Creating S3 bucket..."
    aws s3 mb s3://culinary-compass-app --region us-east-1
} else {
    Write-Host "S3 bucket already exists, skipping creation..."
}

# Disable block public access
Write-Host "Configuring bucket public access..."
aws s3api put-public-access-block `
    --bucket culinary-compass-app `
    --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"

# Wait a few seconds for the changes to propagate
Start-Sleep -Seconds 5

# Configure website hosting
Write-Host "Configuring website hosting..."
aws s3 website s3://culinary-compass-app --index-document index.html

# Upload files with correct content types
Write-Host "Uploading files..."
aws s3 cp index.html s3://culinary-compass-app/ --content-type "text/html"
aws s3 cp style.css s3://culinary-compass-app/ --content-type "text/css"
aws s3 cp script.js s3://culinary-compass-app/ --content-type "application/javascript"
aws s3 cp config.js s3://culinary-compass-app/ --content-type "application/javascript"

# Create and apply bucket policy
Write-Host "Applying bucket policy..."
$policy = '{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::culinary-compass-app/*"
            ]
        }
    ]
}'

# Save policy to a file
$policy | Out-File -FilePath "bucket-policy.json" -Encoding ascii -NoNewline

# Apply the policy
Write-Host "Waiting for public access block changes to propagate..."
Start-Sleep -Seconds 5
aws s3api put-bucket-policy --bucket culinary-compass-app --policy file://bucket-policy.json

# Clean up policy file
Remove-Item "bucket-policy.json"

# Create DynamoDB table if it doesn't exist
if (-not (Test-ResourceExists -resourceType "dynamodb" -resourceName "recipes-cache")) {
    Write-Host "Creating DynamoDB table..."
    aws dynamodb create-table `
        --table-name recipes-cache `
        --attribute-definitions AttributeName=id,AttributeType=S `
        --key-schema AttributeName=id,KeyType=HASH `
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
} else {
    Write-Host "DynamoDB table already exists, skipping creation..."
}

Write-Host "`nDeployment complete!"
Write-Host "Website URL: http://culinary-compass-app.s3-website-us-east-1.amazonaws.com"

# Test the deployment
Write-Host "`nTesting deployment..."
try {
    $websiteUrl = "http://culinary-compass-app.s3-website-us-east-1.amazonaws.com"
    $response = Invoke-WebRequest -Uri $websiteUrl -Method Head
    Write-Host "Website is accessible!"
} catch {
    Write-Host "Warning: Website might not be immediately accessible. Please wait a few minutes and try the URL in your browser."
}

# Test DynamoDB connection
Write-Host "`nTesting DynamoDB connection..."
try {
    aws dynamodb describe-table --table-name recipes-cache | Out-Null
    Write-Host "DynamoDB table is accessible!"
} catch {
    Write-Host "Warning: Could not connect to DynamoDB table. Please check your AWS credentials and permissions."
}

# Final verification
Write-Host "`nVerifying final configuration..."
Write-Host "1. Checking bucket website configuration..."
aws s3api get-bucket-website --bucket culinary-compass-app

Write-Host "`n2. Checking bucket policy..."
aws s3api get-bucket-policy --bucket culinary-compass-app

Write-Host "`n3. Checking public access settings..."
aws s3api get-public-access-block --bucket culinary-compass-app

Write-Host "`nSetup complete! Please wait a few minutes for all changes to propagate."
Write-Host "Then visit: http://culinary-compass-app.s3-website-us-east-1.amazonaws.com"