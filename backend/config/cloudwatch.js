const logger = require('./logger');

// Conditional CloudWatch import (only in production/staging)
let CloudWatchClient, PutMetricDataCommand;
let cloudwatchClient;

if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  try {
    const cloudwatchSDK = require('@aws-sdk/client-cloudwatch');
    CloudWatchClient = cloudwatchSDK.CloudWatchClient;
    PutMetricDataCommand = cloudwatchSDK.PutMetricDataCommand;

    cloudwatchClient = new CloudWatchClient({
      region: process.env.AWS_REGION || 'ap-south-1'
    });
  } catch (error) {
    logger.warn('CloudWatch SDK not available, metrics will be logged only');
  }
}

const NAMESPACE = 'NurseryManagement';
const environment = process.env.NODE_ENV || 'development';

class CloudWatchMetrics {
  /**
   * Send custom metric to CloudWatch
   */
  async putMetric(metricName, value, unit = 'Count', dimensions = {}) {
    // In development, just log the metric
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
      logger.debug('CloudWatch metric (dev mode)', {
        metricName,
        value,
        unit,
        dimensions
      });
      return;
    }

    // If CloudWatch is not available, just log
    if (!cloudwatchClient || !PutMetricDataCommand) {
      logger.debug('CloudWatch metric (SDK not available)', {
        metricName,
        value,
        unit,
        dimensions
      });
      return;
    }

    try {
      const params = {
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: [
              {
                Name: 'Environment',
                Value: environment
              },
              ...Object.entries(dimensions).map(([key, val]) => ({
                Name: key,
                Value: String(val)
              }))
            ]
          }
        ]
      };

      const command = new PutMetricDataCommand(params);
      await cloudwatchClient.send(command);

      logger.debug('CloudWatch metric sent', { metricName, value });
    } catch (error) {
      logger.error('Failed to send CloudWatch metric', {
        error: error.message,
        metricName,
        value
      });
    }
  }

  /**
   * Track order creation
   */
  async trackOrderCreated(orderValue, paymentMethod) {
    await this.putMetric('OrdersCreated', 1, 'Count', {
      PaymentMethod: paymentMethod
    });
    await this.putMetric('OrderValue', orderValue, 'None', {
      PaymentMethod: paymentMethod
    });
  }

  /**
   * Track delivery completion
   */
  async trackDeliveryCompleted(deliveryTime) {
    await this.putMetric('DeliveriesCompleted', 1, 'Count');
    await this.putMetric('DeliveryTime', deliveryTime, 'Seconds');
  }

  /**
   * Track API errors
   */
  async trackError(errorType, endpoint) {
    await this.putMetric('APIErrors', 1, 'Count', {
      ErrorType: errorType,
      Endpoint: endpoint
    });
  }

  /**
   * Track API response time
   */
  async trackResponseTime(endpoint, duration, statusCode) {
    await this.putMetric('APIResponseTime', duration, 'Milliseconds', {
      Endpoint: endpoint,
      StatusCode: String(statusCode)
    });
  }

  /**
   * Track database query performance
   */
  async trackDatabaseQuery(queryType, duration) {
    await this.putMetric('DatabaseQueryTime', duration, 'Milliseconds', {
      QueryType: queryType
    });
  }

  /**
   * Track cache hit/miss
   */
  async trackCacheHit(cacheKey, isHit) {
    await this.putMetric(isHit ? 'CacheHits' : 'CacheMisses', 1, 'Count', {
      CacheKey: cacheKey
    });
  }

  /**
   * Track user authentication
   */
  async trackAuthentication(success, method) {
    await this.putMetric(
      success ? 'AuthenticationSuccess' : 'AuthenticationFailure',
      1,
      'Count',
      { Method: method }
    );
  }

  /**
   * Track WhatsApp message sent
   */
  async trackWhatsAppMessage(messageType, success) {
    await this.putMetric(
      success ? 'WhatsAppMessagesSent' : 'WhatsAppMessagesFailed',
      1,
      'Count',
      { MessageType: messageType }
    );
  }
}

module.exports = new CloudWatchMetrics();
