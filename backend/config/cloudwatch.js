const logger = require('./logger');

// Conditional GCP Cloud Monitoring import (only in production/staging)
let MetricServiceClient;
let monitoringClient;

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;

if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  try {
    const monitoring = require('@google-cloud/monitoring');
    MetricServiceClient = monitoring.MetricServiceClient;

    monitoringClient = new MetricServiceClient({
      projectId: GCP_PROJECT_ID,
      keyFilename: process.env.GCP_KEY_FILE,
    });
  } catch (error) {
    logger.warn('GCP Monitoring SDK not available, metrics will be logged only');
  }
}

const NAMESPACE = 'nursery_management';
const environment = process.env.NODE_ENV || 'development';

class GCPMetrics {
  /**
   * Send custom metric to GCP Cloud Monitoring
   */
  async putMetric(metricName, value, unit = 'Count', dimensions = {}) {
    // In development, just log the metric
    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
      logger.debug('GCP metric (dev mode)', {
        metricName,
        value,
        unit,
        dimensions
      });
      return;
    }

    // If GCP Monitoring is not available, just log
    if (!monitoringClient || !GCP_PROJECT_ID) {
      logger.debug('GCP metric (SDK not available)', {
        metricName,
        value,
        unit,
        dimensions
      });
      return;
    }

    try {
      const labels = {
        environment,
        ...Object.fromEntries(
          Object.entries(dimensions).map(([k, v]) => [k, String(v)])
        ),
      };

      await monitoringClient.createTimeSeries({
        name: monitoringClient.projectPath(GCP_PROJECT_ID),
        timeSeries: [
          {
            metric: {
              type: `custom.googleapis.com/${NAMESPACE}/${metricName}`,
              labels,
            },
            resource: {
              type: 'global',
              labels: { project_id: GCP_PROJECT_ID },
            },
            points: [
              {
                interval: { endTime: { seconds: Math.floor(Date.now() / 1000) } },
                value: { doubleValue: value },
              },
            ],
          },
        ],
      });

      logger.debug('GCP metric sent', { metricName, value });
    } catch (error) {
      logger.error('Failed to send GCP metric', {
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

module.exports = new GCPMetrics();
