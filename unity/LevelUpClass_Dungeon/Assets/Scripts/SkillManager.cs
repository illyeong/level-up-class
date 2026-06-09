using System.Collections.Generic;
using UnityEngine;

public interface IDungeonSkill
{
    bool IsReady { get; }
    float Cooldown { get; }
    void Initialize(GameObject owner);
    void Activate();
}

public class SkillManager : MonoBehaviour
{
    [System.Serializable]
    public class SkillEntry
    {
        public string skillId;
        public GameObject skillPrefab;
        public Sprite icon;
    }

    [Header("Skill Prefabs")]
    public List<SkillEntry> skills = new List<SkillEntry>();

    private readonly Dictionary<string, SkillEntry> _entries = new Dictionary<string, SkillEntry>();
    private readonly Dictionary<string, IDungeonSkill> _runtimeSkills = new Dictionary<string, IDungeonSkill>();
    private readonly Dictionary<string, float> _cooldownEndsAt = new Dictionary<string, float>();

    private void Awake()
    {
        RebuildCache();
    }

    public bool HasSkill(string skillId)
    {
        if (string.IsNullOrEmpty(skillId)) return false;
        RebuildCache();
        return _entries.ContainsKey(skillId) || FindExistingSkill(skillId) != null;
    }

    public Sprite GetIcon(string skillId)
    {
        RebuildCache();
        return _entries.TryGetValue(skillId, out var entry) ? entry.icon : null;
    }

    public float GetCooldown(string skillId, float fallback = 10f)
    {
        IDungeonSkill skill = GetOrCreateSkill(skillId);
        return skill != null && skill.Cooldown > 0f ? skill.Cooldown : fallback;
    }

    public bool IsReady(string skillId)
    {
        IDungeonSkill skill = GetOrCreateSkill(skillId);
        return skill != null && skill.IsReady && !IsOnCooldown(skillId);
    }

    public bool UseSkill(string skillId)
    {
        IDungeonSkill skill = GetOrCreateSkill(skillId);
        if (skill == null || !skill.IsReady || IsOnCooldown(skillId)) return false;

        skill.Activate();
        _cooldownEndsAt[skillId] = Time.time + Mathf.Max(0f, skill.Cooldown);
        return true;
    }

    private bool IsOnCooldown(string skillId)
    {
        return _cooldownEndsAt.TryGetValue(skillId, out float endsAt) && Time.time < endsAt;
    }

    private void RebuildCache()
    {
        _entries.Clear();
        foreach (var entry in skills)
        {
            if (entry == null || string.IsNullOrEmpty(entry.skillId)) continue;
            _entries[entry.skillId] = entry;
        }
    }

    private IDungeonSkill GetOrCreateSkill(string skillId)
    {
        if (string.IsNullOrEmpty(skillId)) return null;

        if (_runtimeSkills.TryGetValue(skillId, out var cached) && cached != null)
            return cached;

        IDungeonSkill existing = FindExistingSkill(skillId);
        if (existing != null)
        {
            existing.Initialize(gameObject);
            _runtimeSkills[skillId] = existing;
            return existing;
        }

        RebuildCache();
        if (!_entries.TryGetValue(skillId, out var entry) || entry.skillPrefab == null)
            return null;

        GameObject instance = Instantiate(entry.skillPrefab, transform);
        instance.name = $"{entry.skillPrefab.name}_Runtime";

        IDungeonSkill skill = null;
        foreach (var component in instance.GetComponents<MonoBehaviour>())
        {
            if (component is IDungeonSkill dungeonSkill)
            {
                skill = dungeonSkill;
                break;
            }
        }
        if (skill == null)
        {
            Debug.LogWarning($"[SkillManager] Skill prefab '{entry.skillPrefab.name}' has no IDungeonSkill component.");
            Destroy(instance);
            return null;
        }

        skill.Initialize(gameObject);
        _runtimeSkills[skillId] = skill;
        return skill;
    }

    private IDungeonSkill FindExistingSkill(string skillId)
    {
        return skillId switch
        {
            "thunder_god" => GetComponent<SkillThunderGod>(),
            "fire_breath" => GetComponent<SkillFireBreath>(),
            "explosive_bomb" => GetComponent<SkillExplosiveBomb>(),
            _ => null
        };
    }
}
