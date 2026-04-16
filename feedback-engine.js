(function (global) {
  function buildFeedback(params, helpers) {
    const renderedTrainingFeedback = helpers.buildTrainingLibraryFeedback(
      params.item,
      params.exampleMatch,
    );

    if (!renderedTrainingFeedback) {
      return "";
    }

    const consensusInputs = buildConsensusInputs(params.item, params.exampleMatch, helpers);
    if (!consensusInputs.length) {
      return renderedTrainingFeedback;
    }

    const normalized = helpers.normalizeTrainingLibraryFeedback(consensusInputs[0].text);
    if (!normalized) {
      return renderedTrainingFeedback;
    }

    const analysis = analyzeConsensusFeedback(consensusInputs, helpers);
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

  function buildConsensusInputs(item, exampleMatch, helpers) {
    const matches = Array.isArray(exampleMatch?.consensusMatches) && exampleMatch.consensusMatches.length
      ? exampleMatch.consensusMatches
      : [exampleMatch].filter(Boolean);

    return matches
      .map((match) => ({
        score: Number(match?.score || 0),
        text: helpers.buildTrainingLibraryFeedback(item, match),
      }))
      .filter((entry) => entry.text);
  }

  function analyzeConsensusFeedback(inputs, helpers) {
    const analyses = inputs.map((entry) => analyzeTrainingFeedback(entry.text, entry.score, helpers));
    const action = selectConsensusPart(analyses, "action");
    const summary = selectConsensusPart(analyses, "summary");
    const supportingDetail = pickConsensusSupportingDetail(analyses, summary, action);

    return {
      action,
      summary,
      supportingDetail,
    };
  }

  function analyzeTrainingFeedback(text, score, helpers) {
    const normalized = helpers.normalizeTrainingLibraryFeedback(text);
    const segments = splitIntoSegments(normalized);
    const extractedAction = sanitizeActionCandidate(
      helpers.extractActionClauseFromFeedback(normalized),
    );
    const action = extractedAction
      ? `Customer should ${professionalizeAction(extractedAction)}.`
      : "";
    const summarySource = segments.find(
      (segment) => !looksLikeAction(segment) && !looksLikeListOnly(segment),
    ) || "";

    return {
      score: Number(score || 0),
      action,
      summary: summarySource ? ensureSentence(professionalizeSummary(summarySource)) : "",
      supportingDetail: pickSupportingDetail(segments, summarySource, action),
    };
  }

  function selectConsensusPart(analyses, key) {
    const candidateMap = new Map();

    analyses.forEach((analysis, index) => {
      const value = String(analysis?.[key] || "").trim();
      if (!value) {
        return;
      }

      const normalizedKey = value.toLowerCase();
      const existing = candidateMap.get(normalizedKey) || {
        text: value,
        totalScore: 0,
        count: 0,
        firstIndex: index,
      };
      existing.totalScore += Number(analysis.score || 0);
      existing.count += 1;
      candidateMap.set(normalizedKey, existing);
    });

    const rankedCandidates = [...candidateMap.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      return left.firstIndex - right.firstIndex;
    });

    return rankedCandidates[0]?.text || "";
  }

  function pickConsensusSupportingDetail(analyses, summary, action) {
    const detailMap = new Map();
    const summaryKey = String(summary || "").trim().toLowerCase();
    const actionKey = String(action || "").trim().toLowerCase();

    analyses.forEach((analysis, index) => {
      const detail = String(analysis?.supportingDetail || "").trim();
      if (!detail) {
        return;
      }

      const normalizedDetail = detail.toLowerCase();
      if (normalizedDetail === summaryKey || normalizedDetail === actionKey) {
        return;
      }

      const existing = detailMap.get(normalizedDetail) || {
        text: detail,
        totalScore: 0,
        count: 0,
        firstIndex: index,
      };
      existing.totalScore += Number(analysis.score || 0);
      existing.count += 1;
      detailMap.set(normalizedDetail, existing);
    });

    const rankedDetails = [...detailMap.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }
      return left.firstIndex - right.firstIndex;
    });

    return rankedDetails[0]?.text ? ensureSentence(rankedDetails[0].text) : "";
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
    const normalized = String(sentence || "").trim();
    if (!normalized) {
      return false;
    }

    if (/^(below|observed|interface|interfaces|neighbor|neighbors|node|module|process|feature|syslog|tcam|smu)\b/i.test(normalized)) {
      return false;
    }

    return /\b(customer|please|check|verify|validate|confirm|review|ensure|inspect|compare|monitor|engage|investigate|should|needs?\s+to|need\s+to)\b/i.test(
      normalized,
    );
  }

  function professionalizeSummary(sentence) {
    return String(sentence || "")
      .replace(/\bJPME\b/gi, "JPMC")
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
        .replace(/\bJPME\b/gi, "JPMC")
        .replace(/\s+/g, " ")
        .trim();

      if (looksLikeInterfaceList(cleaned)) {
        return cleaned;
      }

      return cleaned.length > 220 ? `${cleaned.slice(0, 217).trim()}...` : cleaned;
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
      .replace(/\bJPME\b/gi, "JPMC")
      .replace(/\bcheck if\b/gi, "verify whether")
      .replace(/\bvalidate if\b/gi, "verify whether")
      .replace(/\bvalidate\b/gi, "verify")
      .replace(/\bcheck\b/gi, "review")
      .replace(/\ball the prefixes coming from this neighbour is properly installed in your routing and bgp table\b/gi, "all prefixes received from the affected neighbors are properly installed in the routing and BGP tables")
      .replace(/^(?:JPMC|Customer)(?:\s+team)?\s+/i, "")
      .replace(/\bneed to\b/gi, "")
      .replace(/\bneeds to\b/gi, "")
      .replace(/\bshould\s+should\b/gi, "should")
      .replace(/\s+/g, " ")
      .replace(/^[,.\s-]+|[,.\s-]+$/g, "")
      .trim();

    if (looksLikeInterfaceList(normalized)) {
      return normalized;
    }

    return normalized.length > 220
      ? `${normalized.slice(0, 217).trim()}...`
      : normalized;
  }

  function sanitizeActionCandidate(actionClause) {
    const normalized = String(actionClause || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }

    if (/^(below|observed|interface|interfaces|neighbor|neighbors|node|module|process|feature|syslog|tcam|smu)\b/i.test(normalized)) {
      return "";
    }

    return normalized;
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

  function looksLikeInterfaceList(segment) {
    const normalized = String(segment || "").trim();
    return /^ethernet\d+\/\d+/i.test(normalized) || /^eth\s*\d+\//i.test(normalized);
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
