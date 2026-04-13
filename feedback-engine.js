(function (global) {
  function buildFeedback(params, helpers) {
    const renderedTrainingFeedback = helpers.buildTrainingLibraryFeedback(
      params.item,
      params.exampleMatch,
    );

    if (!renderedTrainingFeedback) {
      return "";
    }

    const normalized = helpers.normalizeTrainingLibraryFeedback(renderedTrainingFeedback);
    if (!normalized) {
      return renderedTrainingFeedback;
    }

    const analysis = analyzeTrainingFeedback(normalized, helpers);
    const parts = [
      analysis.action,
      analysis.summary,
      analysis.supportingDetail,
    ].filter(Boolean);

    if (!parts.length) {
      return normalized;
    }

    return helpers.normalizeTrainingLibraryFeedback(parts.join(" "));
  }

  function analyzeTrainingFeedback(text, helpers) {
    const segments = splitIntoSegments(text);
    const extractedAction = helpers.extractActionClauseFromFeedback(text);
    const action = extractedAction
      ? `Customer should ${professionalizeAction(extractedAction)}.`
      : "";

    const summarySource = segments.find(
      (segment) => !looksLikeAction(segment) && !looksLikeListOnly(segment),
    ) || "";
    const summary = summarySource ? ensureSentence(professionalizeSummary(summarySource)) : "";

    const supportingDetail = pickSupportingDetail(segments, summary, action);

    return {
      action,
      summary,
      supportingDetail: supportingDetail ? ensureSentence(supportingDetail) : "",
    };
  }

  function splitIntoSegments(text) {
    const lines = String(text || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return dedupeSentences(
      lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean),
    );
  }

  function dedupeSentences(sentences) {
    const seen = new Set();
    const unique = [];

    sentences.forEach((sentence) => {
      const key = sentence.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      unique.push(sentence);
    });

    return unique;
  }

  function looksLikeAction(sentence) {
    return /\b(customer|please|check|verify|validate|confirm|review|ensure|inspect|compare|monitor|engage|investigate|should|needs?\s+to|need\s+to)\b/i.test(
      String(sentence || ""),
    );
  }

  function professionalizeSummary(sentence) {
    return String(sentence || "")
      .replace(/\bJPMC\b/gi, "Customer")
      .replace(/\bneed to\b/gi, "should")
      .replace(/\bneeds to\b/gi, "should")
      .replace(/\bit could be historical\b/gi, "This may be historical")
      .replace(/\bBelow\b/g, "Observed")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickSupportingDetail(segments, summary, action) {
    const summaryKey = String(summary || "").toLowerCase();
    const actionKey = String(action || "").toLowerCase();
    const detailCandidate = segments.find((segment) => {
      const normalized = segment.toLowerCase();
      return (
        normalized !== summaryKey &&
        normalized !== actionKey &&
        !looksLikeAction(segment) &&
        !looksLikeListOnly(segment)
      );
    });

    if (detailCandidate) {
      const cleaned = String(detailCandidate)
        .replace(/\bJPMC\b/gi, "Customer")
        .replace(/\s+/g, " ")
        .trim();

      return cleaned.length > 160 ? `${cleaned.slice(0, 157).trim()}...` : cleaned;
    }

    const listCandidate = segments.find((segment) => {
      const normalized = segment.toLowerCase();
      return normalized !== summaryKey && normalized !== actionKey && looksLikeNeighborList(segment);
    });

    if (listCandidate) {
      return formatNeighborDetail(listCandidate);
    }

    return "";
  }

  function professionalizeAction(actionClause) {
    const normalized = String(actionClause || "")
      .replace(/\bJPMC\b/gi, "Customer")
      .replace(/\bcheck if\b/gi, "verify whether")
      .replace(/\bvalidate if\b/gi, "verify whether")
      .replace(/\bvalidate\b/gi, "verify")
      .replace(/\bcheck\b/gi, "review")
      .replace(/\ball the prefixes coming from this neighbour is properly installed in your routing and bgp table\b/gi, "all prefixes received from the affected neighbors are properly installed in the routing and BGP tables")
      .replace(/\bneed to\b/gi, "")
      .replace(/\bneeds to\b/gi, "")
      .replace(/\bshould\s+should\b/gi, "should")
      .replace(/\s+/g, " ")
      .replace(/^[,.\s-]+|[,.\s-]+$/g, "")
      .trim();

    return normalized.length > 180
      ? `${normalized.slice(0, 177).trim()}...`
      : normalized;
  }

  function ensureSentence(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();

    if (!normalized) {
      return "";
    }

    return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
  }

  function looksLikeListOnly(segment) {
    const normalized = String(segment || "").trim();
    return (
      /^neighbor\s+\d{1,3}(?:\.\d{1,3}){3}/i.test(normalized) ||
      /^affected /i.test(normalized) ||
      normalized.split(",").length >= 4
    );
  }

  function looksLikeNeighborList(segment) {
    return /^neighbor\s+\d{1,3}(?:\.\d{1,3}){3}/i.test(String(segment || "").trim());
  }

  function formatNeighborDetail(segment) {
    const ips = String(segment || "").match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
    if (!ips.length) {
      return "";
    }

    const uniqueIps = [...new Set(ips)];
    const preview = uniqueIps.slice(0, 4).join(", ");
    const suffix = uniqueIps.length > 4 ? ` (+${uniqueIps.length - 4} more)` : "";
    return `Affected neighbors: ${preview}${suffix}`;
  }

  global.FEEDBACK_ENGINE = {
    buildFeedback,
  };
})(window);
