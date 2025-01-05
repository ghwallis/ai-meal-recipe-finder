# WasaWasa Culinary 🍳

WasawasaCulinary is your ultimate digital kitchen companion that combines technology and culinary expertise to bring the joy of cooking and dining to your fingertips. Whether you're a home cook, a foodie, or someone looking for nearby dining options, WasawasaCulinary has something for everyone. 

Explore recipes based on ingredients you have, identify meals from photos, and discover restaurants near you—all powered by state-of-the-art technologies like AWS, Spoonacular, and Google APIs.

---

## Architecture Overview 🏗️

![AWS Architecture](https://github.com/user-attachments/assets/a571fd78-ab4a-4030-95f5-01c198038c2b)

### Components
- **Frontend**:
  - Static website hosted on S3
  - Interactive and responsive user interface
- **Backend Services**:
  - **DynamoDB**: Efficient recipe caching with TTL for cleanup
  - **CloudWatch**: Real-time monitoring and alerts
  - **IAM**: Fine-grained security controls for backend resources
- **External APIs**:
  - **Spoonacular API**: Comprehensive recipe database and search functionality
  - **Google Cloud Vision API**: Image recognition for meal identification
  - **Google Maps API**: Find nearby restaurants and culinary hotspots

---

## Key Features 🌟

### 🥗 Recipe Exploration
- Search for recipes using a list of ingredients.
- Identify recipes from meal photos with Google Vision.
- Explore curated recipes and cooking tips.

### 🍽️ Restaurant Discovery
- Find nearby restaurants based on your location.
- Integrated with Google Maps for seamless navigation.

### 🚀 Smart Optimization
- Recipe caching with DynamoDB for faster access.
- Automatic cache cleanup with TTL, ensuring up-to-date results.
- Cost-effective design with monitoring via CloudWatch.

### 🔒 Secure and Reliable
- Role-based access with AWS IAM.
- Continuous monitoring to track API usage and application health.

---

## Technical Stack 💻

### AWS Services
- **S3**: Static website hosting with secure bucket policies.
- **DynamoDB**: High-performance NoSQL database for caching recipes efficiently.
- **CloudWatch**: Real-time cost monitoring and performance tracking.
- **IAM**: Secure and limited role-based access.

### External APIs
- **Spoonacular API**: Recipe search and meal data.
- **Google Cloud Vision API**: Advanced image analysis for meal recognition.
- **Google Maps API**: Restaurant and location services integration.

---

## Setup Instructions 🚀

### Prerequisites
- An AWS Account with permissions to use S3, DynamoDB, CloudWatch, and IAM.
- **Node.js** (v14 or higher) installed locally.
- **AWS CLI** installed and configured with your AWS account.
- **PowerShell** (v5.1 or higher) or a compatible terminal.

### Local Development Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-repo/wasawasaculinary.git
   cd wasawasaculinary
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**:
   - Create a `.env` file with the following keys:
     ```env
     AWS_REGION=your-aws-region
     SPOONACULAR_API_KEY=your-spoonacular-api-key
     GOOGLE_VISION_API_KEY=your-google-vision-api-key
     GOOGLE_MAPS_API_KEY=your-google-maps-api-key
     ```

4. **Start Local Development Server**:
   ```bash
   npm start
   ```

5. **Deploy to AWS**:
   - Run the deployment script to upload files to S3 and set up DynamoDB:
     ```bash
     npm run deploy
     ```

---

## Contribution Guidelines 🤝

We welcome contributions! To contribute:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature-name`).
3. Commit your changes (`git commit -m "Add feature"`).
4. Push your branch (`git push origin feature-name`).
5. Open a Pull Request.

---

## Future Enhancements 🔮

- Add user authentication for personalized recipe recommendations.
- Expand restaurant finder to include dietary preferences.
- Integrate AI for advanced meal planning.
- Enable offline recipe access with service workers.

---

## License 📜

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

## Contact 📧
For questions or support, please contact us at [support@wasawasaculinary.com](mailto:support@culinarycompass.com).
