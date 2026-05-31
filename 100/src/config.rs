use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClusterType {
    #[serde(rename = "docker")]
    Docker,
    #[serde(rename = "k8s")]
    Kubernetes,
    #[serde(rename = "swarm")]
    DockerSwarm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_file: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout: u64,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub groups: Vec<String>,
    #[serde(default)]
    pub labels: std::collections::HashMap<String, String>,
}

fn default_timeout() -> u64 {
    30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterConfig {
    pub name: String,
    pub cluster_type: ClusterType,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub nodes: Vec<NodeConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub clusters: Vec<ClusterConfig>,
}

impl AppConfig {
    pub fn new() -> Self {
        Self {
            version: "1.0".to_string(),
            clusters: Vec::new(),
        }
    }

    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();
        if !path.exists() {
            return Ok(Self::new());
        }

        let content = fs::read_to_string(path)
            .with_context(|| format!("读取配置文件失败: {}", path.display()))?;

        let config: AppConfig = serde_yaml::from_str(&content)
            .with_context(|| format!("解析配置文件失败: {}", path.display()))?;

        Ok(config)
    }

    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("创建配置目录失败: {}", parent.display()))?;
            }
        }

        let yaml = serde_yaml::to_string(self)
            .context("序列化配置失败")?;

        fs::write(path, yaml)
            .with_context(|| format!("写入配置文件失败: {}", path.display()))?;

        Ok(())
    }

    pub fn add_cluster(&mut self, cluster: ClusterConfig) {
        if let Some(existing) = self.clusters.iter_mut().find(|c| c.name == cluster.name) {
            *existing = cluster;
        } else {
            self.clusters.push(cluster);
        }
    }

    pub fn remove_cluster(&mut self, name: &str) -> bool {
        if let Some(pos) = self.clusters.iter().position(|c| c.name == name) {
            self.clusters.remove(pos);
            true
        } else {
            false
        }
    }

    pub fn get_cluster(&self, name: &str) -> Option<&ClusterConfig> {
        self.clusters.iter().find(|c| c.name == name)
    }

    pub fn get_filtered_nodes(
        &self,
        cluster_name: Option<&str>,
        node_name: Option<&str>,
    ) -> Vec<(String, NodeConfig)> {
        self.get_filtered_nodes_with_opts(cluster_name, node_name, None, None)
    }

    pub fn get_filtered_nodes_with_opts(
        &self,
        cluster_name: Option<&str>,
        node_name: Option<&str>,
        groups: Option<&[String]>,
        labels: Option<&[(String, String)]>,
    ) -> Vec<(String, NodeConfig)> {
        let mut result = Vec::new();

        let clusters: Vec<&ClusterConfig> = match cluster_name {
            Some(name) => self.clusters.iter().filter(|c| c.name == name).collect(),
            None => self.clusters.iter().collect(),
        };

        for cluster in clusters {
            let nodes: Vec<&NodeConfig> = match node_name {
                Some(name) => cluster.nodes.iter().filter(|n| n.name == name).collect(),
                None => cluster.nodes.iter().filter(|n| n.enabled).collect(),
            };

            for node in nodes {
                if let Some(groups) = groups {
                    if !groups.is_empty() && !groups.iter().any(|g| node.groups.contains(g)) {
                        continue;
                    }
                }

                if let Some(labels) = labels {
                    let mut label_match = true;
                    for (k, v) in labels {
                        match node.labels.get(k) {
                            Some(node_v) if node_v == v => continue,
                            _ => {
                                label_match = false;
                                break;
                            }
                        }
                    }
                    if !label_match {
                        continue;
                    }
                }

                result.push((cluster.name.clone(), node.clone()));
            }
        }

        result
    }

    pub fn validate(&self) -> Result<()> {
        if self.clusters.is_empty() {
            return Ok(());
        }

        let mut cluster_names = std::collections::HashSet::new();
        for cluster in &self.clusters {
            if cluster.name.is_empty() {
                anyhow::bail!("集群名称不能为空");
            }
            if !cluster_names.insert(&cluster.name) {
                anyhow::bail!("集群名称重复: {}", cluster.name);
            }

            let mut node_names = std::collections::HashSet::new();
            for node in &cluster.nodes {
                if node.name.is_empty() {
                    anyhow::bail!("集群 {} 中存在空的节点名称", cluster.name);
                }
                if !node_names.insert(&node.name) {
                    anyhow::bail!("集群 {} 中节点名称重复: {}", cluster.name, node.name);
                }
                if node.host.is_empty() {
                    anyhow::bail!("节点 {}.{} 的主机地址不能为空", cluster.name, node.name);
                }
            }
        }

        Ok(())
    }

    pub fn generate_template() -> Self {
        Self {
            version: "1.0".to_string(),
            clusters: vec![
                ClusterConfig {
                    name: "production".to_string(),
                    cluster_type: ClusterType::Docker,
                    description: "生产环境Docker集群".to_string(),
                    nodes: vec![
                        NodeConfig {
                            name: "node-01".to_string(),
                            host: "192.168.1.101".to_string(),
                            port: 22,
                            user: "root".to_string(),
                            password: None,
                            key_file: Some("~/.ssh/id_rsa".to_string()),
                            timeout: 30,
                            enabled: true,
                            groups: vec!["master".to_string(), "database".to_string()],
                            labels: [
                                ("env".to_string(), "prod".to_string()),
                                ("az".to_string(), "cn-beijing-a".to_string()),
                            ].iter().cloned().collect(),
                        },
                        NodeConfig {
                            name: "node-02".to_string(),
                            host: "192.168.1.102".to_string(),
                            port: 22,
                            user: "root".to_string(),
                            password: None,
                            key_file: Some("~/.ssh/id_rsa".to_string()),
                            timeout: 30,
                            enabled: true,
                            groups: vec!["worker".to_string(), "web".to_string()],
                            labels: [
                                ("env".to_string(), "prod".to_string()),
                                ("az".to_string(), "cn-beijing-b".to_string()),
                            ].iter().cloned().collect(),
                        },
                    ],
                },
                ClusterConfig {
                    name: "staging".to_string(),
                    cluster_type: ClusterType::Kubernetes,
                    description: "测试环境K8s集群".to_string(),
                    nodes: vec![
                        NodeConfig {
                            name: "k8s-master".to_string(),
                            host: "10.0.0.10".to_string(),
                            port: 22,
                            user: "admin".to_string(),
                            password: Some("password".to_string()),
                            key_file: None,
                            timeout: 30,
                            enabled: true,
                            groups: vec!["master".to_string()],
                            labels: [
                                ("env".to_string(), "staging".to_string()),
                            ].iter().cloned().collect(),
                        },
                    ],
                },
            ],
        }
    }
}

pub fn format_output<T: Serialize>(data: &T, format: &str) -> Result<String> {
    match format.to_lowercase().as_str() {
        "json" => Ok(serde_json::to_string_pretty(data)?),
        "yaml" => Ok(serde_yaml::to_string(data)?),
        _ => anyhow::bail!("不支持的输出格式: {}", format),
    }
}
