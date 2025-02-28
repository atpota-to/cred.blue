// src/components/Admin/AdminPanel.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import './AdminPanel.css';

const AdminPanel = () => {
  // State management
  const [resources, setResources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // New/Edit resource form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    url: '',
    domain: '',
    featured: false,
    position: 0,
    selectedCategories: [],
    selectedTags: []
  });

  // Alert state
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
      
      if (session) {
        fetchAllData();
      } else {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError(null);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) throw error;
      
      setIsAuthenticated(true);
      fetchAllData();
    } catch (error) {
      console.error('Error logging in:', error);
      setAuthError(error.message);
      setIsLoading(false);
    }
  };

  // Logout handler
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  // Fetch all required data from Supabase
  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // Fetch resources
      const { data: resourcesData, error: resourcesError } = await supabase
        .from('resources')
        .select('*')
        .order('position');

      if (resourcesError) throw resourcesError;

      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (categoriesError) throw categoriesError;

      // Fetch tags
      const { data: tagsData, error: tagsError } = await supabase
        .from('tags')
        .select('*')
        .order('name');

      if (tagsError) throw tagsError;

      // Fetch resource-category associations
      const { data: resourceCategories, error: rcError } = await supabase
        .from('resource_categories')
        .select('*');

      if (rcError) throw rcError;

      // Fetch resource-tag associations
      const { data: resourceTags, error: rtError } = await supabase
        .from('resource_tags')
        .select('*');

      if (rtError) throw rtError;

      // Enhance resources with their associated categories and tags
      const enhancedResources = resourcesData.map(resource => {
        const resourceCats = resourceCategories
          .filter(rc => rc.resource_id === resource.id)
          .map(rc => rc.category_id);
          
        const resourceTs = resourceTags
          .filter(rt => rt.resource_id === resource.id)
          .map(rt => rt.tag_id);
          
        return {
          ...resource,
          categoryIds: resourceCats,
          tagIds: resourceTs
        };
      });

      // Update state
      setResources(enhancedResources);
      setCategories(categoriesData);
      setTags(tagsData);
    } catch (error) {
      console.error('Error fetching data:', error);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle resource selection
  const handleSelectResource = (resource) => {
    setSelectedResource(resource);
    setFormData({
      name: resource.name || '',
      description: resource.description || '',
      url: resource.url || '',
      domain: resource.domain || '',
      featured: resource.featured || false,
      position: resource.position || 0,
      selectedCategories: resource.categoryIds || [],
      selectedTags: resource.tagIds || []
    });
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // Handle category selection changes
  const handleCategoryChange = (categoryId) => {
    setFormData(prevData => {
      const selectedCategories = [...prevData.selectedCategories];
      
      if (selectedCategories.includes(categoryId)) {
        // Remove category if already selected
        return {
          ...prevData,
          selectedCategories: selectedCategories.filter(id => id !== categoryId)
        };
      } else {
        // Add category if not already selected
        return {
          ...prevData,
          selectedCategories: [...selectedCategories, categoryId]
        };
      }
    });
  };

  // Handle tag selection changes
  const handleTagChange = (tagId) => {
    setFormData(prevData => {
      const selectedTags = [...prevData.selectedTags];
      
      if (selectedTags.includes(tagId)) {
        // Remove tag if already selected
        return {
          ...prevData,
          selectedTags: selectedTags.filter(id => id !== tagId)
        };
      } else {
        // Add tag if not already selected
        return {
          ...prevData,
          selectedTags: [...selectedTags, tagId]
        };
      }
    });
  };

  // Clear form and selected resource
  const handleClearForm = () => {
    setSelectedResource(null);
    setFormData({
      name: '',
      description: '',
      url: '',
      domain: '',
      featured: false,
      position: resources.length + 1,
      selectedCategories: [],
      selectedTags: []
    });
  };

  // Show alert message
  const showAlert = (message, type = 'success') => {
    setAlert({ show: true, message, type });
    setTimeout(() => {
      setAlert({ show: false, message: '', type: '' });
    }, 5000);
  };

  // Save resource changes
  const handleSaveResource = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const resourceData = {
        name: formData.name,
        description: formData.description,
        url: formData.url,
        domain: formData.domain,
        featured: formData.featured,
        position: formData.position,
        updated_at: new Date().toISOString()
      };
      
      let resourceId;
      
      if (selectedResource) {
        // Update existing resource
        const { error } = await supabase
          .from('resources')
          .update(resourceData)
          .eq('id', selectedResource.id);
          
        if (error) throw error;
        resourceId = selectedResource.id;
        
        // Delete existing category and tag associations
        await supabase
          .from('resource_categories')
          .delete()
          .eq('resource_id', resourceId);
          
        await supabase
          .from('resource_tags')
          .delete()
          .eq('resource_id', resourceId);
          
        showAlert(`Resource "${formData.name}" updated successfully!`);
      } else {
        // Add new resource
        resourceData.created_at = new Date().toISOString();
        
        const { data, error } = await supabase
          .from('resources')
          .insert(resourceData)
          .select();
          
        if (error) throw error;
        resourceId = data[0].id;
        
        showAlert(`Resource "${formData.name}" created successfully!`);
      }
      
      // Add category associations
      if (formData.selectedCategories.length > 0) {
        const categoryAssociations = formData.selectedCategories.map(categoryId => ({
          resource_id: resourceId,
          category_id: categoryId
        }));
        
        const { error: categoryError } = await supabase
          .from('resource_categories')
          .insert(categoryAssociations);
          
        if (categoryError) throw categoryError;
      }
      
      // Add tag associations
      if (formData.selectedTags.length > 0) {
        const tagAssociations = formData.selectedTags.map(tagId => ({
          resource_id: resourceId,
          tag_id: tagId
        }));
        
        const { error: tagError } = await supabase
          .from('resource_tags')
          .insert(tagAssociations);
          
        if (tagError) throw tagError;
      }
      
      // Refresh data
      fetchAllData();
      handleClearForm();
    } catch (error) {
      console.error('Error saving resource:', error);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete resource
  const handleDeleteResource = async (resourceId, resourceName) => {
    if (!window.confirm(`Are you sure you want to delete "${resourceName}"?`)) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Delete associated records first (foreign key constraints)
      await supabase
        .from('resource_categories')
        .delete()
        .eq('resource_id', resourceId);
        
      await supabase
        .from('resource_tags')
        .delete()
        .eq('resource_id', resourceId);
      
      // Delete the resource
      const { error } = await supabase
        .from('resources')
        .delete()
        .eq('id', resourceId);
        
      if (error) throw error;
      
      showAlert(`Resource "${resourceName}" deleted successfully!`);
      
      // Refresh data
      fetchAllData();
      
      // Clear form if the deleted resource was selected
      if (selectedResource && selectedResource.id === resourceId) {
        handleClearForm();
      }
    } catch (error) {
      console.error('Error deleting resource:', error);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Create new category
  const handleCreateCategory = async () => {
    const categoryName = prompt('Enter the new category name:');
    if (!categoryName) return;
    
    const emoji = prompt('Enter an emoji for this category:');
    if (!emoji) return;
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({
          name: categoryName,
          emoji: emoji,
          created_at: new Date().toISOString()
        })
        .select();
        
      if (error) throw error;
      
      showAlert(`Category "${categoryName}" created successfully!`);
      fetchAllData();
    } catch (error) {
      console.error('Error creating category:', error);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Create new tag
  const handleCreateTag = async () => {
    const tagName = prompt('Enter the new tag name:');
    if (!tagName) return;
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('tags')
        .insert({
          name: tagName,
          created_at: new Date().toISOString()
        })
        .select();
        
      if (error) throw error;
      
      showAlert(`Tag "${tagName}" created successfully!`);
      fetchAllData();
    } catch (error) {
      console.error('Error creating tag:', error);
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Render loading spinner
  if (isLoading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Render login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="admin-login-container">
        <div className="admin-login-card">
          <h2>Admin Login</h2>
          {authError && <div className="auth-error">{authError}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="login-button">Login</button>
          </form>
        </div>
      </div>
    );
  }

  // Main admin panel UI
  return (
    <div className="admin-panel">
      {/* Header */}
      <header className="admin-header">
        <h1>Resources Admin Panel</h1>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </header>

      {/* Alert message */}
      {alert.show && (
        <div className={`alert ${alert.type}`}>
          {alert.message}
        </div>
      )}

      <div className="admin-container">
        {/* Resources list sidebar */}
        <div className="resources-sidebar">
          <div className="sidebar-header">
            <h2>Resources</h2>
            <button onClick={handleClearForm} className="add-new-button">
              + New Resource
            </button>
          </div>
          <div className="resources-list">
            {resources.map(resource => (
              <div 
                key={resource.id} 
                className={`resource-item ${selectedResource && selectedResource.id === resource.id ? 'selected' : ''}`}
                onClick={() => handleSelectResource(resource)}
              >
                <div className="resource-item-name">{resource.name}</div>
                <div className="resource-item-actions">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteResource(resource.id, resource.name);
                    }}
                    className="delete-button"
                    title="Delete resource"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resource edit form */}
        <div className="resource-editor">
          <h2>{selectedResource ? 'Edit Resource' : 'Add New Resource'}</h2>
          <form onSubmit={handleSaveResource}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="name">Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="domain">Domain</label>
                <input
                  type="text"
                  id="domain"
                  name="domain"
                  value={formData.domain}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="url">URL *</label>
              <input
                type="url"
                id="url"
                name="url"
                value={formData.url}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description *</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="4"
                required
              ></textarea>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="position">Position</label>
                <input
                  type="number"
                  id="position"
                  name="position"
                  value={formData.position}
                  onChange={handleInputChange}
                  min="0"
                />
              </div>
              <div className="form-group checkbox-group">
                <input
                  type="checkbox"
                  id="featured"
                  name="featured"
                  checked={formData.featured}
                  onChange={handleInputChange}
                />
                <label htmlFor="featured">Featured Resource</label>
              </div>
            </div>

            <div className="form-row">
              {/* Categories selection */}
              <div className="form-group categories-section">
                <div className="section-header">
                  <label>Categories</label>
                  <button 
                    type="button" 
                    onClick={handleCreateCategory}
                    className="add-item-button"
                  >
                    + Add Category
                  </button>
                </div>
                <div className="checkbox-list">
                  {categories.map(category => (
                    <div key={category.id} className="checkbox-item">
                      <input
                        type="checkbox"
                        id={`category-${category.id}`}
                        checked={formData.selectedCategories.includes(category.id)}
                        onChange={() => handleCategoryChange(category.id)}
                      />
                      <label htmlFor={`category-${category.id}`}>
                        {category.emoji} {category.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags selection */}
              <div className="form-group tags-section">
                <div className="section-header">
                  <label>Tags</label>
                  <button 
                    type="button" 
                    onClick={handleCreateTag}
                    className="add-item-button"
                  >
                    + Add Tag
                  </button>
                </div>
                <div className="checkbox-list">
                  {tags.map(tag => (
                    <div key={tag.id} className="checkbox-item">
                      <input
                        type="checkbox"
                        id={`tag-${tag.id}`}
                        checked={formData.selectedTags.includes(tag.id)}
                        onChange={() => handleTagChange(tag.id)}
                      />
                      <label htmlFor={`tag-${tag.id}`}>
                        #{tag.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" onClick={handleClearForm} className="cancel-button">
                Cancel
              </button>
              <button type="submit" className="save-button">
                {selectedResource ? 'Update Resource' : 'Create Resource'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;