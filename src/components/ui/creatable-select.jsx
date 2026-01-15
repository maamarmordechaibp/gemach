
    import React from 'react';
    import Creatable from 'react-select/creatable';

    const CreatableSelect = ({ ...props }) => {
        const customStyles = {
            control: (provided) => ({
                ...provided,
                backgroundColor: 'hsl(var(--input))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--foreground))',
                boxShadow: 'none',
                '&:hover': {
                    borderColor: 'hsl(var(--ring))',
                },
            }),
            menu: (provided) => ({
                ...provided,
                backgroundColor: 'hsl(var(--secondary))',
                borderColor: 'hsl(var(--border))',
            }),
            option: (provided, state) => ({
                ...provided,
                backgroundColor: state.isSelected ? 'hsl(var(--primary))' : state.isFocused ? 'hsl(var(--accent))' : 'hsl(var(--secondary))',
                color: state.isSelected ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))',
                ':active': {
                    backgroundColor: 'hsl(var(--primary))',
                },
            }),
            input: (provided) => ({
                ...provided,
                color: 'hsl(var(--foreground))',
            }),
            multiValue: (provided) => ({
                ...provided,
                backgroundColor: 'hsl(var(--primary))',
                color: 'hsl(var(--primary-foreground))',
            }),
            multiValueLabel: (provided) => ({
                ...provided,
                color: 'hsl(var(--primary-foreground))',
            }),
            multiValueRemove: (provided) => ({
                ...provided,
                color: 'hsl(var(--primary-foreground))',
                ':hover': {
                    backgroundColor: 'hsl(var(--destructive))',
                    color: 'hsl(var(--destructive-foreground))',
                },
            }),
        };

        return <Creatable styles={customStyles} {...props} />;
    };

    export default CreatableSelect;
  