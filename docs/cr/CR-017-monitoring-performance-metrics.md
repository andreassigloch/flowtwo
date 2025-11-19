# CR-017: Monitoring & Performance Metrics

**Status:** Planned
**Priority:** LOW
**Target Phase:** Phase 6 (Production Readiness)
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

The system lacks monitoring and performance metrics for production operations. According to [implan.md:350-355](../implan.md#L350-L355), production deployment requires:

- LLM usage tracking (cost optimization)
- Layout performance metrics (responsiveness)
- Token reduction measurements (caching effectiveness)
- User activity logs (analytics)

**Current Status:** NOT IMPLEMENTED (Phase 6 feature)

**Impact:** Without monitoring:
- Cannot optimize LLM costs (no usage data)
- Cannot detect performance degradation
- Cannot measure caching effectiveness
- No visibility into production issues

## Requirements

**From implan.md Phase 6 requirements:**

1. **LLM Usage Tracking:**
   - Track API calls (count, latency)
   - Measure token usage (input, output, cached)
   - Calculate costs per workspace/user
   - Identify high-usage patterns

2. **Layout Performance Metrics:**
   - Measure layout computation time
   - Track graph sizes (node/edge counts)
   - Identify performance bottlenecks
   - Monitor memory usage

3. **Token Reduction Measurements:**
   - Calculate cache hit rate
   - Measure prompt caching effectiveness
   - Track token savings vs baseline
   - Optimize caching strategy

4. **User Activity Logs:**
   - Track commands executed
   - Monitor session durations
   - Identify feature usage patterns
   - Detect anomalous behavior

## Proposed Solution

### 1. Metrics Collection System

```typescript
interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  tags: Record<string, string>;
}

interface MetricCollector {
  recordCounter(name: string, value: number, tags?: Record<string, string>): void;
  recordGauge(name: string, value: number, tags?: Record<string, string>): void;
  recordHistogram(name: string, value: number, tags?: Record<string, string>): void;
  recordTiming(name: string, durationMs: number, tags?: Record<string, string>): void;
}

class PrometheusMetricCollector implements MetricCollector {
  private counters: Map<string, Counter> = new Map();
  private gauges: Map<string, Gauge> = new Map();
  private histograms: Map<string, Histogram> = new Map();

  recordCounter(name: string, value: number, tags?: Record<string, string>) {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = new Counter({ name, help: name, labelNames: Object.keys(tags || {}) });
      this.counters.set(name, counter);
    }
    counter.inc(tags, value);
  }

  // Similar for gauge, histogram, timing...
}
```

### 2. LLM Usage Tracking

```typescript
interface LLMUsageMetric {
  timestamp: Date;
  workspaceId: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  cost: number;
  promptHash: string;
  cacheHit: boolean;
}

class LLMUsageTracker {
  async trackLLMCall(metric: LLMUsageMetric): Promise<void> {
    // Record in time-series database (Prometheus, InfluxDB)
    metrics.recordCounter('llm_calls_total', 1, {
      workspace: metric.workspaceId,
      model: metric.model,
      cache_hit: String(metric.cacheHit)
    });

    metrics.recordCounter('llm_tokens_total', metric.inputTokens + metric.outputTokens, {
      type: 'total',
      workspace: metric.workspaceId
    });

    metrics.recordCounter('llm_tokens_total', metric.cachedTokens, {
      type: 'cached',
      workspace: metric.workspaceId
    });

    metrics.recordHistogram('llm_latency_ms', metric.latencyMs, {
      workspace: metric.workspaceId
    });

    metrics.recordCounter('llm_cost_usd', metric.cost, {
      workspace: metric.workspaceId
    });

    // Store in Neo4j for historical analysis
    await this.storeLLMUsage(metric);
  }

  async calculateCostSavings(workspaceId: string, period: 'day' | 'week' | 'month'): Promise<number> {
    // Compare cached vs non-cached token usage
    const cached = await this.getTotalCachedTokens(workspaceId, period);
    const total = await this.getTotalTokens(workspaceId, period);

    const cachingRate = cached / total;
    const costWithoutCache = total * TOKEN_COST;
    const actualCost = (total - cached) * TOKEN_COST;

    return costWithoutCache - actualCost;
  }
}
```

### 3. Layout Performance Metrics

```typescript
interface LayoutMetric {
  timestamp: Date;
  viewType: string;
  nodeCount: number;
  edgeCount: number;
  computationTimeMs: number;
  memoryUsageMB: number;
  algorithmUsed: string;
}

class LayoutPerformanceTracker {
  async trackLayoutComputation(metric: LayoutMetric): Promise<void> {
    metrics.recordHistogram('layout_computation_ms', metric.computationTimeMs, {
      view: metric.viewType,
      algorithm: metric.algorithmUsed
    });

    metrics.recordGauge('graph_size_nodes', metric.nodeCount, {
      view: metric.viewType
    });

    metrics.recordGauge('graph_size_edges', metric.edgeCount, {
      view: metric.viewType
    });

    metrics.recordGauge('layout_memory_mb', metric.memoryUsageMB, {
      view: metric.viewType
    });

    // Alert if performance degrades
    if (metric.computationTimeMs > 2000 && metric.nodeCount < 500) {
      this.alertPerformanceDegradation(metric);
    }
  }

  async getPerformanceReport(period: 'day' | 'week' | 'month'): Promise<PerformanceReport> {
    return {
      averageLayoutTime: await this.getAverageLayoutTime(period),
      p95LayoutTime: await this.getP95LayoutTime(period),
      maxGraphSize: await this.getMaxGraphSize(period),
      slowestViews: await this.getSlowestViews(period, 5)
    };
  }
}
```

### 4. Cache Effectiveness Metrics

```typescript
interface CacheMetric {
  timestamp: Date;
  cacheType: 'llm' | 'canvas' | 'ontology';
  hits: number;
  misses: number;
  evictions: number;
  sizeMB: number;
  hitRate: number;
}

class CacheMetricsTracker {
  async trackCacheAccess(
    cacheType: string,
    hit: boolean,
    keyHash: string
  ): Promise<void> {
    metrics.recordCounter('cache_access_total', 1, {
      cache: cacheType,
      result: hit ? 'hit' : 'miss'
    });

    // Update hit rate gauge
    const hitRate = await this.calculateHitRate(cacheType);
    metrics.recordGauge('cache_hit_rate', hitRate, {
      cache: cacheType
    });
  }

  async getCacheEffectivenessReport(): Promise<CacheReport> {
    return {
      llmCache: {
        hitRate: await this.calculateHitRate('llm'),
        tokensSaved: await this.getTotalCachedTokens('llm'),
        costSavings: await this.calculateCostSavings('llm')
      },
      canvasCache: {
        hitRate: await this.calculateHitRate('canvas'),
        loadTimeSavings: await this.calculateLoadTimeSavings('canvas')
      },
      ontologyCache: {
        hitRate: await this.calculateHitRate('ontology'),
        queryReduction: await this.calculateQueryReduction('ontology')
      }
    };
  }
}
```

### 5. User Activity Analytics

```typescript
interface UserActivityMetric {
  timestamp: Date;
  userId: string;
  workspaceId: string;
  sessionId: string;
  action: string;
  details: Record<string, any>;
  durationMs?: number;
}

class UserActivityTracker {
  async trackActivity(metric: UserActivityMetric): Promise<void> {
    metrics.recordCounter('user_actions_total', 1, {
      action: metric.action,
      workspace: metric.workspaceId
    });

    if (metric.durationMs) {
      metrics.recordHistogram('action_duration_ms', metric.durationMs, {
        action: metric.action
      });
    }

    // Store in Neo4j for analytics
    await this.storeActivity(metric);
  }

  async getUsageReport(workspaceId: string, period: 'day' | 'week' | 'month'): Promise<UsageReport> {
    return {
      activeUsers: await this.getActiveUserCount(workspaceId, period),
      topCommands: await this.getTopCommands(workspaceId, period, 10),
      averageSessionDuration: await this.getAverageSessionDuration(workspaceId, period),
      entitiesCreated: await this.getEntitiesCreated(workspaceId, period),
      peakUsageHours: await this.getPeakUsageHours(workspaceId, period)
    };
  }
}
```

### 6. Dashboard & Alerts

```typescript
interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  notificationChannels: string[];
}

const ALERT_RULES: AlertRule[] = [
  {
    name: 'High LLM Cost',
    condition: 'llm_cost_usd > threshold',
    threshold: 100, // $100/day
    severity: 'WARNING',
    notificationChannels: ['email', 'slack']
  },
  {
    name: 'Low Cache Hit Rate',
    condition: 'cache_hit_rate < threshold',
    threshold: 0.5, // 50%
    severity: 'INFO',
    notificationChannels: ['slack']
  },
  {
    name: 'Slow Layout Performance',
    condition: 'layout_computation_ms > threshold',
    threshold: 3000, // 3 seconds
    severity: 'WARNING',
    notificationChannels: ['email']
  },
  {
    name: 'Neo4j Connection Failures',
    condition: 'neo4j_connection_errors > threshold',
    threshold: 5, // 5 failures/minute
    severity: 'CRITICAL',
    notificationChannels: ['email', 'slack', 'pagerduty']
  }
];
```

## Implementation Plan

### Phase 1: Metrics Infrastructure (3-4 hours)
1. Install Prometheus client library
2. Create `src/monitoring/metrics-collector.ts`
3. Set up Prometheus endpoint (/metrics)
4. Configure Grafana dashboards
5. Test metric collection

### Phase 2: LLM Usage Tracking (3-4 hours)
1. Create `src/monitoring/llm-usage-tracker.ts`
2. Integrate with LLMEngine
3. Track tokens, costs, cache hits
4. Calculate cost savings reports
5. Create LLM usage dashboard

### Phase 3: Layout Performance Tracking (2-3 hours)
1. Create `src/monitoring/layout-performance-tracker.ts`
2. Integrate with layout algorithms
3. Track computation time, memory usage
4. Create performance dashboard
5. Add performance alerts

### Phase 4: Cache Metrics (2-3 hours)
1. Create `src/monitoring/cache-metrics-tracker.ts`
2. Integrate with AgentDB caching
3. Track hit rates, evictions
4. Calculate token savings
5. Create cache effectiveness dashboard

### Phase 5: User Activity Analytics (3-4 hours)
1. Create `src/monitoring/user-activity-tracker.ts`
2. Track commands, session durations
3. Store activity in Neo4j
4. Generate usage reports
5. Create user analytics dashboard

### Phase 6: Alerts & Notifications (2-3 hours)
1. Define alert rules
2. Integrate with notification channels (email, Slack)
3. Test alert triggering
4. Document alert response procedures

### Phase 7: Testing & Documentation (2-3 hours)
1. Write unit tests for metric tracking
2. Test dashboards with realistic data
3. Validate alert rules
4. Document monitoring setup
5. Create runbook for common alerts

## Acceptance Criteria

- [ ] Prometheus metrics endpoint functional (/metrics)
- [ ] LLM usage tracked (tokens, costs, cache hits)
- [ ] Layout performance metrics collected
- [ ] Cache effectiveness measured (hit rate, savings)
- [ ] User activity analytics functional
- [ ] Grafana dashboards created (4 dashboards minimum)
- [ ] Alert rules configured and tested
- [ ] Notifications sent to appropriate channels
- [ ] Metrics stored in time-series database
- [ ] Documentation complete (setup, dashboards, alerts)

## Dependencies

- Prometheus (time-series database) - needs installation
- Grafana (dashboards) - needs installation
- Notification services (email, Slack) - needs configuration
- Neo4j for historical analytics (already implemented)

## Estimated Effort

- Metrics Infrastructure: 3-4 hours
- LLM Usage Tracking: 3-4 hours
- Layout Performance Tracking: 2-3 hours
- Cache Metrics: 2-3 hours
- User Activity Analytics: 3-4 hours
- Alerts & Notifications: 2-3 hours
- Testing & Documentation: 2-3 hours
- **Total: 17-24 hours (3-4 days)**

## Benefits

**Cost Optimization:**
- Track LLM API costs per workspace/user
- Measure caching effectiveness
- Identify optimization opportunities

**Performance Visibility:**
- Detect performance degradation early
- Optimize slow layout algorithms
- Monitor resource usage

**Production Operations:**
- Proactive alerting
- Data-driven optimization
- Better capacity planning

**User Insights:**
- Understand feature usage
- Identify power users
- Optimize user experience

## References

- [implan.md:350-355](../implan.md#L350-L355) - Phase 6 Monitoring section
- requirements.md NFR-3 - Performance requirements
- Prometheus documentation: https://prometheus.io/docs/
- Grafana documentation: https://grafana.com/docs/

## Notes

- Implement after core features stable (Phase 6 priority)
- Start with essential metrics, add more as needed
- Consider retention policy (7 days detailed, 90 days aggregated)
- Monitor monitoring overhead (should be <1% of system resources)
- Privacy consideration: Don't log sensitive user data (PII, content)
