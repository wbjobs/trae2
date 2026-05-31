package com.research.asset.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.research.asset.dto.TagAutoClassifyDTO;
import com.research.asset.dto.TagDTO;
import com.research.asset.entity.Asset;
import com.research.asset.entity.Tag;
import com.research.asset.enums.AssetType;
import com.research.asset.enums.ClassificationLevel;
import com.research.asset.repository.AssetRepository;
import com.research.asset.repository.TagRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TagService {

    private final TagRepository tagRepository;
    private final AssetRepository assetRepository;
    private final ObjectMapper objectMapper;

    @Transactional
    public TagDTO createTag(TagDTO dto) {
        Tag tag = new Tag();
        tag.setTagName(dto.getTagName());
        tag.setTagCode(dto.getTagCode());
        tag.setTagType(dto.getTagType() != null ? dto.getTagType() : "CUSTOM");
        tag.setColor(dto.getColor());
        tag.setDescription(dto.getDescription());
        tag.setUseCount(0);
        tag = tagRepository.save(tag);
        return convertToDTO(tag);
    }

    @Transactional
    public void deleteTag(UUID id) {
        Tag tag = tagRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("标签不存在"));
        if ("SYSTEM".equals(tag.getTagType())) {
            throw new IllegalArgumentException("系统标签不能删除");
        }
        tagRepository.delete(tag);
    }

    public List<TagDTO> getAllTags() {
        return tagRepository.findAllByOrderByUseCountDesc().stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    public List<TagDTO> getHotTags(int limit) {
        Pageable pageable = PageRequest.of(0, limit);
        return tagRepository.findAllByOrderByUseCountDesc(pageable).stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public void classifyAsset(UUID assetId, List<UUID> tagIds) {
        Asset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        
        Set<Tag> tags = new HashSet<>();
        if (tagIds != null && !tagIds.isEmpty()) {
            tags = new HashSet<>(tagRepository.findAllById(tagIds));
        }
        
        Set<Tag> oldTags = asset.getTags();
        if (oldTags != null) {
            for (Tag oldTag : oldTags) {
                if (!tags.contains(oldTag)) {
                    decrementTagUseCount(oldTag.getId());
                }
            }
        }
        
        asset.setTags(tags);
        assetRepository.save(asset);
        
        for (Tag tag : tags) {
            incrementTagUseCount(tag.getId());
        }
    }

    @Transactional
    public TagAutoClassifyDTO autoClassifyAsset(UUID assetId) {
        Asset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));

        String content = buildContentForMatching(asset);
        List<Tag> allTags = tagRepository.findAll();
        Set<Tag> matchedTags = new HashSet<>();
        Set<String> allMatchedKeywords = new HashSet<>();
        Map<Tag, Integer> tagMatchScores = new HashMap<>();

        for (Tag tag : allTags) {
            List<String> matchedKeywords = matchTag(tag, content);
            if (!matchedKeywords.isEmpty()) {
                matchedTags.add(tag);
                allMatchedKeywords.addAll(matchedKeywords);
                tagMatchScores.put(tag, matchedKeywords.size());
            }
        }

        List<Tag> typeTags = matchByAssetType(asset);
        for (Tag typeTag : typeTags) {
            if (!matchedTags.contains(typeTag)) {
                matchedTags.add(typeTag);
                tagMatchScores.put(typeTag, 1);
            }
        }

        List<Tag> classificationTags = matchByClassificationLevel(asset);
        for (Tag classTag : classificationTags) {
            if (!matchedTags.contains(classTag)) {
                matchedTags.add(classTag);
                tagMatchScores.put(classTag, 1);
            }
        }

        List<Tag> sortedTags = matchedTags.stream()
                .sorted((a, b) -> tagMatchScores.get(b) - tagMatchScores.get(a))
                .collect(Collectors.toList());

        TagAutoClassifyDTO result = new TagAutoClassifyDTO();
        result.setAssetId(assetId);
        result.setAssetTitle(asset.getTitle());
        result.setMatchedTags(sortedTags.stream().map(this::convertToDTO).collect(Collectors.toList()));
        result.setMatchedKeywords(new ArrayList<>(allMatchedKeywords));
        result.setClassifyReason(buildClassifyReason(sortedTags, tagMatchScores));

        classifyAsset(assetId, sortedTags.stream().map(Tag::getId).collect(Collectors.toList()));

        return result;
    }

    @Transactional
    public void incrementTagUseCount(UUID tagId) {
        Tag tag = tagRepository.findById(tagId).orElse(null);
        if (tag != null) {
            tag.setUseCount(tag.getUseCount() + 1);
            tagRepository.save(tag);
        }
    }

    @Transactional
    public void decrementTagUseCount(UUID tagId) {
        Tag tag = tagRepository.findById(tagId).orElse(null);
        if (tag != null && tag.getUseCount() > 0) {
            tag.setUseCount(tag.getUseCount() - 1);
            tagRepository.save(tag);
        }
    }

    public List<TagDTO> getAssetTags(UUID assetId) {
        Asset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new EntityNotFoundException("资产不存在"));
        Set<Tag> tags = asset.getTags();
        if (tags == null) {
            return Collections.emptyList();
        }
        return tags.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    private String buildContentForMatching(Asset asset) {
        StringBuilder sb = new StringBuilder();
        sb.append(asset.getTitle()).append(" ");
        if (asset.getAbstractText() != null) {
            sb.append(asset.getAbstractText()).append(" ");
        }
        if (asset.getKeywords() != null) {
            sb.append(asset.getKeywords()).append(" ");
        }
        if (asset.getAuthors() != null) {
            sb.append(asset.getAuthors()).append(" ");
        }
        return sb.toString().toLowerCase();
    }

    private List<String> matchTag(Tag tag, String content) {
        List<String> matchedKeywords = new ArrayList<>();
        String ruleJson = tag.getAutoClassifyRule();
        if (ruleJson == null || ruleJson.isEmpty()) {
            return matchedKeywords;
        }

        try {
            Map<String, Object> rule = objectMapper.readValue(ruleJson, Map.class);
            List<String> keywords = (List<String>) rule.get("keywords");
            if (keywords != null) {
                for (String keyword : keywords) {
                    if (content.contains(keyword.toLowerCase())) {
                        matchedKeywords.add(keyword);
                    }
                }
            }
        } catch (Exception e) {
            // 忽略解析错误
        }

        return matchedKeywords;
    }

    private List<Tag> matchByAssetType(Asset asset) {
        List<Tag> tags = new ArrayList<>();
        AssetType assetType = asset.getAssetType();
        Map<AssetType, String> typeTagCodeMap = new HashMap<>();
        typeTagCodeMap.put(AssetType.PAPER, "ASSET_JOURNAL");
        typeTagCodeMap.put(AssetType.REPORT, "ASSET_REPORT");
        typeTagCodeMap.put(AssetType.PATENT, "ASSET_PATENT");
        typeTagCodeMap.put(AssetType.DATA, "ASSET_DATA");

        String tagCode = typeTagCodeMap.get(assetType);
        if (tagCode != null) {
            tagRepository.findByTagCode(tagCode).ifPresent(tags::add);
        }

        return tags;
    }

    private List<Tag> matchByClassificationLevel(Asset asset) {
        List<Tag> tags = new ArrayList<>();
        ClassificationLevel level = asset.getClassificationLevel();
        Map<ClassificationLevel, String> levelTagCodeMap = new HashMap<>();
        levelTagCodeMap.put(ClassificationLevel.PUBLIC, "CLASS_PUBLIC");
        levelTagCodeMap.put(ClassificationLevel.INTERNAL, "CLASS_INTERNAL");
        levelTagCodeMap.put(ClassificationLevel.CONFIDENTIAL, "CLASS_CONFIDENTIAL");
        levelTagCodeMap.put(ClassificationLevel.SECRET, "CLASS_SECRET");

        String tagCode = levelTagCodeMap.get(level);
        if (tagCode != null) {
            tagRepository.findByTagCode(tagCode).ifPresent(tags::add);
        }

        return tags;
    }

    private String buildClassifyReason(List<Tag> tags, Map<Tag, Integer> scores) {
        StringBuilder sb = new StringBuilder();
        sb.append("智能分类共匹配到 ").append(tags.size()).append(" 个标签：");
        for (int i = 0; i < Math.min(tags.size(), 5); i++) {
            Tag tag = tags.get(i);
            sb.append("[").append(tag.getTagName()).append("(").append(scores.get(tag)).append("分)");
            if (i < Math.min(tags.size(), 5) - 1) {
                sb.append("]、");
            } else {
                sb.append("]");
            }
        }
        if (tags.size() > 5) {
            sb.append("等");
        }
        return sb.toString();
    }

    private TagDTO convertToDTO(Tag tag) {
        TagDTO dto = new TagDTO();
        dto.setId(tag.getId());
        dto.setTagName(tag.getTagName());
        dto.setTagCode(tag.getTagCode());
        dto.setTagType(tag.getTagType());
        dto.setColor(tag.getColor());
        dto.setDescription(tag.getDescription());
        dto.setUseCount(tag.getUseCount());
        dto.setCreatedAt(tag.getCreatedAt());
        return dto;
    }
}
