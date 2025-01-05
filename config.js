const Config = {
    init() {
        // Validate required environment variables
        const required = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_REGION',
            'SPOONACULAR_API_KEY',
            'GOOGLE_VISION_API_KEY'
        ];

        const missing = required.filter(key => !ENV[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Set up cost monitoring if AWS SDK is available
        if (typeof AWS !== 'undefined') {
            this.setupCostAlerts();
        }

        return ENV;
    },

    isAWSConfigured() {
        return ENV.AWS_ACCESS_KEY_ID && ENV.AWS_SECRET_ACCESS_KEY && ENV.AWS_REGION;
    },

    async setupCostAlerts() {
        try {
            const cloudwatch = new AWS.CloudWatch();
            await cloudwatch.putMetricAlarm({
                AlarmName: 'CulinaryCompassCostAlert',
                ComparisonOperator: 'GreaterThanThreshold',
                EvaluationPeriods: 1,
                MetricName: 'EstimatedCharges',
                Namespace: 'AWS/Billing',
                Period: 86400, // 24 hours
                Statistic: 'Maximum',
                Threshold: 1.0, // $1
                ActionsEnabled: true,
                AlarmDescription: 'Alert when monthly costs exceed $1'
            }).promise();
            console.log('Cost alert set up successfully');
        } catch (error) {
            console.error('Failed to set up cost alert:', error);
        }
    }
};

// Initialize configuration
try {
    Config.init();
} catch (error) {
    console.error('Configuration Error:', error);
    alert('There was an error initializing the application. Please check the console for details.');
} 